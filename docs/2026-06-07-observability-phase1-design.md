# Observability Foundation (Phase 1) — Design

Date: 2026-06-07
Status: Approved (brainstorm) — pending implementation plan

## 1. Context

Finby is live in production (API on Render `api.finby.app`, web on Vercel `chat.finby.app`).
Today there is **no product analytics, no error/crash tracking, and no structured
logging** — only NestJS's default console `Logger` landing in Render's log stream
(short retention, weak search). We want to understand how users use the app and to
catch/diagnose production problems, at near-zero cost.

This spec covers **Phase 1 of 2** of the broader monitoring/analytics initiative.

- **Phase 1 (this spec): Observability foundation** — error + performance tracking
  (Sentry, web + API), structured logging (`nestjs-pino`), a cross-cutting PII-scrubbing
  layer, and external uptime monitoring.
- **Phase 2 (separate spec, later): Product analytics** — PostHog event taxonomy for
  activation, feature usage, retention, and upgrade-conversion goals.

### Decisions carried in from the brainstorm
- **Stack:** best-of-breed — **Sentry** (errors/perf) + **PostHog** (analytics, Phase 2).
- **Data/privacy:** third-party SaaS is acceptable, but **no financial PII ever leaves
  our infra** — no amounts, transaction details, merchants, account numbers, emails, or
  names. Users are keyed by **UUID only**.
- **Budget:** ~$0/mo now (free tiers), willing to grow to ~$5–30/mo once it proves useful.

## 2. Goals / Non-goals

**Goals**
- Capture unhandled server errors (5xx) and client/runtime errors with stack traces.
- Basic performance visibility (slow endpoints / slow routes) via sampled tracing.
- Replace ad-hoc `Logger` with structured, correlatable JSON logs on the API.
- Guarantee no financial PII is transmitted to Sentry or written to logs.
- Know when prod is down (uptime monitor + alert).
- Stay within free tiers; enabled in production only.

**Non-goals (Phase 1)**
- Product-analytics events / funnels / dashboards (Phase 2 — PostHog).
- Shipping logs to an external searchable store (Render's stream is enough for now;
  Axiom/Better Stack drain is a later option).
- Session replay (risks capturing on-screen amounts).
- Backend source-map upload is **optional** (compiled stack traces are acceptable to start).

## 3. Architecture overview

Three independently-understandable pieces plus one external service:

1. **Sentry (API)** — `@sentry/nestjs`, initialised before the Nest app boots; errors
   captured at the existing global exception filter; sampled performance tracing.
2. **Sentry (Web)** — `@sentry/nextjs`, App-Router instrumentation; client + server
   error capture and route tracing.
3. **Structured logging (API)** — `nestjs-pino` as the Nest logger, request-id
   correlation, redaction of sensitive fields.
4. **Uptime (external)** — UptimeRobot hitting the API health endpoint and the web app.

A single **`scrubEvent()`** pure function (one per app) is the shared safety net wired
into Sentry's `beforeSend`; pino uses its own `redact` paths. All Sentry/logging is a
**no-op when its DSN is unset**, matching the codebase's existing "optional integration"
env convention — so local/dev/test stay silent and the free tiers are spent on prod only.

## 4. Component design

### 4.1 API — Sentry init (`apps/api/src/instrument.ts`, new)
- New module that calls `Sentry.init({ dsn, environment, tracesSampleRate, beforeSend: scrubEvent })`.
- **Imported as the very first import in `main.ts`** (before `AppModule`) — required by the
  SDK so instrumentation patches modules before they load.
- `Sentry.init` is a no-op guard: if `SENTRY_DSN` is empty, skip init entirely.
- `environment` = `NODE_ENV`; `release` may be set later from a build SHA (optional).

### 4.2 API — error capture in the existing filter (`apps/api/src/common/filters/http-exception.filter.ts`)
- The `@Catch()` filter already distinguishes **expected** `HttpException` (4xx — left
  alone) from **unknown** `Error` (5xx — currently `logger.error`).
- Add `Sentry.captureException(exception)` on the **5xx/unknown branch only**. This:
  - preserves the existing error-contract response shape (`{ statusCode, error, message, details? }`),
  - avoids noise from routine 401/403/404/409/422/429,
  - keeps a single, tested integration point.
- The captured event passes through `beforeSend → scrubEvent` before transmission.

### 4.3 API — structured logging (`nestjs-pino`)
- Add `LoggerModule.forRoot(...)` (from `nestjs-pino`) in `app.module.ts`; set the app
  logger via `app.useLogger(app.get(Logger))` in `main.ts`.
- **Prod:** JSON to stdout (Render captures). **Dev:** `pino-pretty` transport.
- **Level:** `LOG_LEVEL` env (default `info`).
- **Request-id:** `pino-http` `genReqId` (reuse incoming `x-request-id` or generate a UUID);
  echo it on the response header and attach it to the Sentry scope so a log line maps to
  an error.
- **Redaction:** `redact` paths for `req.headers.authorization`, `req.headers.cookie`,
  `req.body`, and money/PII keys (see 4.5).
- Existing `Logger` call sites keep working (Nest's `Logger` delegates to the configured
  logger); no mass rewrite required.

### 4.4 Web — Sentry (`@sentry/nextjs`, Next 15 App Router)
- `apps/web/instrumentation.ts` + `sentry.client.config.ts` / `sentry.server.config.ts`
  (or the SDK's `register()` per the current `@sentry/nextjs` convention).
- Wrap `apps/web/next.config.mjs` with `withSentryConfig` (handles client source-map upload).
- No-op when `NEXT_PUBLIC_SENTRY_DSN` is unset.
- **Session replay disabled.** `tracesSampleRate` low (0.1) to protect the free budget.
- `beforeSend: scrubEvent` (web copy).

### 4.5 PII scrubbing (cross-cutting safety net)
A **pure, unit-tested `scrubEvent(event)`** function in each app, wired to `beforeSend`:
- Drop `request.data` (body), `request.query_string`, and `request.cookies`.
- Remove `Authorization` and `Cookie` headers.
- Recursively redact any object key matching the **deny-list** (case-insensitive):
  `amount`, `amountbase`, `amountlimit`, `amountspent`, `balance`, `pricebase`, `merchant`,
  `accountnumber`, `email`, `password`, `token`, `secret`, `refreshtoken`.
- User context limited to `{ id: userId }` — never email/username/ip.
- pino `redact` mirrors the same key list for logs.
- Philosophy: **default-deny** — over-scrub rather than risk a financial-data leak.

## 5. Configuration & environments

### 5.1 New env vars (all optional → no-op when absent)
| App | Var | Default | Purpose |
|---|---|---|---|
| API | `SENTRY_DSN` | — | enables API Sentry |
| API | `SENTRY_TRACES_SAMPLE_RATE` | `0.1` | perf sampling |
| API | `LOG_LEVEL` | `info` | pino level |
| Web | `NEXT_PUBLIC_SENTRY_DSN` | — | enables web Sentry |
| Build | `SENTRY_AUTH_TOKEN` | — | source-map upload (web; optional for API) |

Added to `apps/api/src/config/env.schema.ts` as `.optional()` (and `.default()` where shown),
following the established pattern. `NEXT_PUBLIC_SENTRY_DSN` is read directly by the web SDK.

### 5.2 Environments
- **Production only.** DSNs/token are set on Render (API) and Vercel (Web); left unset
  locally and in tests, so all instrumentation no-ops there.

### 5.3 Source maps
- **Web:** automatic via `withSentryConfig` + `SENTRY_AUTH_TOKEN` at Vercel build.
- **API:** optional for Phase 1. If compiled stack traces prove too opaque, add Sentry
  source-map upload to the Render build in a follow-up (not blocking).

## 6. Uptime & alerting
- **UptimeRobot** (free): two monitors —
  - `GET https://api.finby.app/api/v1/health` (endpoint already exists),
  - `https://chat.finby.app`.
  - 5-minute interval, **email alerts**. (Monitor type confirmed during build.)
- **Sentry alert rules:** notify on a new issue and on an error-rate spike (email to start;
  Slack optional later).

## 7. Error handling (of the observability layer itself)
- Sentry/pino init failures must **never crash the app**: guard init behind the DSN check;
  wrap init in try/catch and fall back to console logging if the logger fails to construct.
- `scrubEvent` must be total (never throw); on any internal error it returns `null`
  (drops the event) rather than risk sending unscrubbed data.

## 8. Testing strategy
- **API (Jest):**
  - exception filter calls `Sentry.captureException` for a 5xx/unknown error and **not**
    for a 4xx `HttpException` (Sentry mocked);
  - `scrubEvent` removes every deny-list key (nested) and the body/headers;
  - init is a no-op when `SENTRY_DSN` is unset.
- **Web (Vitest):** `scrubEvent` unit tests (pure function). SDK wiring is declarative —
  kept light.
- Full existing suites (API Jest, web Vitest) and both `tsc --noEmit` must stay green.

## 9. Rollout / deployment
1. Land code with all instrumentation **dormant** (no DSNs in prod yet) → verify suites green.
2. Set Sentry DSNs + `SENTRY_AUTH_TOKEN` on Render & Vercel → redeploy → confirm a test
   error appears in each Sentry project and stack traces are readable.
3. Confirm logs are JSON with request-ids in Render.
4. Create the UptimeRobot monitors.
- Direct-to-`main` per the project norm (merge + user-authorized push deploys prod).

## 10. User setup checklist (cannot be done from the dev session)
- [x] Sentry account + `finby-api` (Node/NestJS) and `finby-web` (Next.js) projects → DSNs ready.
- [ ] Sentry: create a build **auth token** (for source-map upload).
- [ ] UptimeRobot account + 2 monitors (type/config at build).
- [ ] Set env vars on **Render** (`SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, optional
      `SENTRY_TRACES_SAMPLE_RATE`/`LOG_LEVEL`) and **Vercel**
      (`NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`).

## 11. Phase 2 preview (out of scope here)
PostHog Cloud: `identify(userId)` / `reset()` on login/logout; a typed event helper with a
non-financial property allow-list; events for the activation funnel, feature usage,
retention, and FREE→PRO conversion; dashboards. Its own spec → plan → build.

## 12. Open questions
- Backend source-map upload now or defer? (Defaulting to **defer**.)
- Alert destination beyond email (Slack/Discord)? (Defaulting to **email only** for Phase 1.)
