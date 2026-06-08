# Finby MVP Readiness Report
**Generated:** 2026-06-09
**Branch:** `main`
**Last commit:** `4fa1c55` — Merge feat/password-meter: password strength meter on register + reset
**Stack:** pnpm monorepo — `apps/api` (NestJS, 19 modules), `apps/web` (Next.js app router), `packages/shared`

---

## 1. Feature Completeness

### Core chat & AI
| Feature | Status | Notes |
|---|---|---|
| Conversational expense/income logging | **Built** | Agentic loop, `MAX_TOOL_ROUNDS=5`, dedup guard, low-confidence drafts → `pending_confirmation` (`chat.service.ts:94-388`) |
| Multi-currency frozen base amounts | **Built** | `amountBase`, `currencyBase`, `fxRateUsed`, `fxRateTimestamp` frozen at entry (`fx.service.ts:78-118`, `transactions.service.ts:83-86`) |
| Contextual AI responses | **Partial** | Prompt injects base currency, accounts, categories, **budget utilization** — but **not** account balances or recent-transactions list; those are on-demand via `query_analytics` only (`chat.service.ts:953-980`) |
| Tool calls | **Built** | **10 tools:** `log_expense`, `log_income`, `log_transfer`, `set_budget`, `update_transaction`, `correct_holding_ticker`, `query_analytics`, `log_investment_event`, `get_market_data`, `get_fx_rate` (`llm.tools.ts`) |
| Tiered chat memory (FREE evict / PRO+ compress) | **Built** | FREE = synchronous eviction; PRO/PREMIUM/FAMILY = fire-and-forget LLM summarization into `rollingContextSummary` (`memory-compression.service.ts`, `memory-policy.service.ts`). One dead branch in `llm.system-prompt.ts:42` (summary injected by ContextAssembler instead) |

### Auth
| Feature | Status | Notes |
|---|---|---|
| Sign up email+password | **Built** | bcrypt, configurable rounds (default 12) (`auth.service.ts:53`) |
| Email verification (soft-nag) | **Built** | Flag only, never enforced server-side (intentional) |
| Login / logout | **Built** | Idempotent logout, revokes refresh token |
| Password reset | **Built** | 32-byte token, sha256 at rest, 1h expiry; revokes all sessions on reset |
| JWT + refresh, rotation | **Built** | Refresh tokens **are** rotated on use (`auth.service.ts:167-182`) |
| Enumeration protection | **Built** | Identical response regardless of email existence (`auth.controller.ts:67`) |

### Dashboard & analytics
| Feature | Status | Notes |
|---|---|---|
| Transaction list | **Built** | Cursor pagination, filters, FREE 90-day cap (`transactions.service.ts:147`) |
| Dashboard summary | **Built** | Composed from analytics summary; **requires** explicit `from`/`to` or 400s |
| Budget creation + tracking | **Built** (backend) | Materialized `amountSpent`, atomic updates (`budgets.service.ts`) |
| Budget thresholds 75/90/100% | **Built** | `crossedBudgetThreshold` fires on upward crossing (`alerts.service.ts:10-15`) |
| Analytics (category/trends) | **Built** | `topMerchants` implemented but **not wired to a route** |
| Export CSV + PDF | **Built** | CSV with quoting; PDF via `pdfkit`. PRO-gated |

### Billing
| Feature | Status | Notes |
|---|---|---|
| Tier model FREE/PRO/PREMIUM/FAMILY | **Built** | `packages/shared/src/types.ts:12` |
| Backend tier gating | **Built** | `@RequireTier`+`TierGuard` on export/market/portfolio/net-worth |
| Stripe checkout | **Built** | `POST .../subscription/checkout` |
| Stripe webhook | **Built** | Handles `checkout.session.completed`, `customer.subscription.updated/deleted`, `invoice.payment_failed/succeeded` (`stripe.provider.ts:123-184`) |
| Billing UI | **Built** | PlanCard, UpgradeModal, UpgradeGate wired to `billing-api.ts` |
| Customer portal | **Built** | `POST .../subscription/portal` → Stripe billingPortal |
| Lemon Squeezy + Paystack | **Built** | Both providers retained, HMAC-verified |

### PWA & mobile — **all Built**
Manifest (`manifest.ts`), service worker, Android one-tap + iOS guided install sheet, 16px inputs (`input.tsx:15`), safe-area insets, `h-dvh` shell, VAPID key fetched from API.

### Transactional email — **all Built**
Verification (signup), welcome (post-verify), password reset all triggered; dark/on-brand templates (`email.templates.ts`); provider-agnostic port that no-ops if `RESEND_API_KEY` unset.

### Push notifications — **all Built**
Subscribe/unsubscribe + VAPID endpoint; budget alert → push path traced (`alerts.service.ts:95` → `push.service.ts:63`); no-ops if VAPID unset.

---

## 2. API Routes

Global: prefix `/api/v1`, global `JwtAuthGuard` + `@Public()`, global `HttpExceptionFilter`, per-route **Zod** validation (not class-validator). ~50 routes across 19 modules.

| Method | Path | Auth | Tier gate | Validated | Ctrl test |
|---|---|---|---|---|---|
| GET | /health | Public | — | — | ✅ |
| POST | /auth/{register,login,refresh,logout,forgot-password,reset-password,verify-email} | Public | — | ✅ | ❌ |
| POST/GET/PATCH | /auth/{resend-verification,me,profile} | JWT | — | ✅ | ❌ |
| GET/POST/PATCH | /workspaces/:id/accounts | JWT+WS+Roles | currencies cap | ✅ | ❌ |
| GET/POST/PATCH/DELETE | /workspaces/:id/transactions | JWT+WS+Roles | currencies cap | ✅ | ❌ |
| GET/POST/PATCH | /workspaces/:id/budgets | JWT+WS+Roles | — | ✅ | ❌ |
| GET/PATCH | /workspaces/:id/alerts | JWT+WS | — | ✅ | ❌ |
| GET | /workspaces/:id/analytics/{summary,by-category,trend} | JWT+WS | trend tier-capped | ✅ | ❌ |
| GET | /workspaces/:id/analytics/net-worth | JWT+WS+Tier | **PRO** | — | ❌ |
| GET/POST/PATCH | /workspaces/:id/categories | JWT+WS+Roles | custom-cat cap | ✅ | ❌ |
| GET | /billing/plans | Public | — | — | ✅ |
| GET/POST | /workspaces/:id/subscription/* | JWT+WS+Roles(OWNER) | — | ✅ | ✅ |
| POST | /webhooks/{stripe,paystack,lemonsqueezy} | Public + HMAC | — | raw-body sig | ❌ |
| GET/POST | /workspaces/:id/conversations[/messages] | JWT+WS+Roles | daily msg limit | ✅ | ❌ |
| GET | /workspaces/:id/export | JWT+WS+Tier | **PRO** | ✅ | ❌ |
| GET | /workspaces/:id/market/* | JWT+WS+Tier | **PRO** | partial | ❌ |
| GET/POST | /workspaces/:id/portfolio/* | JWT+WS+Tier | **PRO** | ✅ | ❌ |
| GET/POST | /workspaces/:id/push/* | JWT+WS | — | ✅ | ❌ |
| POST | /feedback | JWT | — | ✅ | ❌ |
| GET | /fx/rate | JWT | — | ✅ | ❌ |
| PATCH | /workspaces/:id/currencies | JWT+WS+Roles(OWNER) | currency cap | ✅ | ❌ |

**Flags:**
- **No public route leaks user data** — all `@Public()` routes are auth flows, static plans, health, or HMAC-verified webhooks. ✅
- **Raw Prisma errors do NOT leak** — global filter maps everything non-`HttpException` to `{500, INTERNAL}` + Sentry (`http-exception.filter.ts:42`). ✅
- **`market/quote/:ticker`** passes an unvalidated string param to the service (low risk, PRO+WS gated).
- **16 of 19 controllers have NO controller-level test; zero e2e specs** — the guard/tier/validation wiring on routes is only covered indirectly by service unit tests.

---

## 3. Schema Health

`prisma validate` → **PASS** (`The schema at prisma/schema.prisma is valid 🚀`, no warnings). *(First run failed only because the Prisma CLI doesn't auto-load root `.env` — not a schema error.)*

19 models. Field confirmations:
- **Conversation** — `rollingContextSummary` ✅, `lastSummarizedAt` ✅, `summarizedTokenCount` ✅, `messageCount` ✅
- **ConversationMessage** — `isInActiveWindow` ✅, `tokenCount` ✅
- **Workspace subscription fields** — ⚠️ **NOT on Workspace.** They live on a separate 1:1 `Subscription` model (`status`, `stripeCustomerId`, `stripeSubscriptionId`, `tier`). The audit checklist assumed Workspace; the actual design is normalized onto `Subscription`. Verify no code does `workspace.stripeCustomerId` (would be `undefined`).

**Findings:**
- **MEDIUM — `Transaction.fromAccount/toAccount` relations default to `onDelete: SetNull`** (`schema.prisma:386-388`). Deleting an account silently nulls historical transaction links → ledger-integrity hazard. Should be explicit `Restrict` + rely on `isArchived`.
- **MEDIUM — No index on `Subscription.stripeSubscriptionId` / provider IDs** — webhook lookups by provider ID will table-scan as volume grows.
- **LOW** — `sourceMessageId`, `createdTransactionId` etc. are bare unindexed strings (rare reverse lookups).

---

## 4. Environment Variables

Only the **root `.env.example`** exists; `apps/api/.env.example` and `apps/web/.env.example` are **missing** (acceptable for single combined env).

| Variable | Req for MVP | In .env.example | Notes |
|---|---|---|---|
| DATABASE_URL | Yes | ✅ | |
| REDIS_URL | Yes | ✅ | |
| JWT_ACCESS_SECRET / JWT_REFRESH_SECRET | Yes | ✅ | validated `min(16)` at startup |
| ANTHROPIC_API_KEY | Yes (chat) | ✅ (blank) | |
| RESEND_API_KEY / EMAIL_FROM | Yes | ✅ (blank) | emails skip if unset |
| STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET | Yes (billing) | ✅ (blank) | **optional** in env schema — see §5 |
| NEXT_PUBLIC_API_URL | Yes | ✅ | |
| VAPID_* | Push | ✅ | no-ops if unset |
| Memory budget vars | Yes | ✅ | |
| **SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN** | Recommended | ❌ | referenced in code, absent from example |
| **NEXT_PUBLIC_POSTHOG_KEY / HOST** | Recommended | ❌ | referenced in code, absent |
| **LOG_LEVEL** | Optional | ❌ | absent (defaults `info`) |

**Hardcoded source fallbacks:** `WEB_URL ?? 'localhost:3000'` (CORS), `NEXT_PUBLIC_API_URL ?? 'localhost:3001'`, PostHog host, Sentry sample rate.

---

## 5. Security

| # | Finding | Severity |
|---|---|---|
| 1 | **No rate limiting anywhere** — no throttler on login, forgot-password, reset-password, resend-verification, refresh. Brute-forceable + mail-bombing surface. | **HIGH** |
| 2 | **No `helmet()` in main.ts** — no HSTS/CSP/security headers. | **HIGH** |
| 3 | **No global `ValidationPipe`** (no `whitelist`/`forbidNonWhitelisted`/`transform`). Mitigated: every `@Body`/`@Query` uses an explicit Zod pipe (strips unknown keys); but any future controller that forgets the pipe has no backstop, and route params aren't validated. | MEDIUM |
| 4 | **CORS falls back to `localhost:3000` if `WEB_URL` unset** (not `*`, good); env schema has a localhost default so prod won't fail loudly. Assert `WEB_URL` in prod. | MEDIUM |
| 5 | **Stripe secrets `optional()` in env schema**, no prod refine. Fails closed at runtime (empty secret → `constructEvent` throws), but a deploy can boot "healthy" with billing misconfigured. | MEDIUM |
| 6 | Access tokens not revocable (15m TTL); reset/logout only revoke refresh tokens. Acceptable. | LOW |
| — | **JWT secrets validated at startup** ✅; **global JWT guard + `@Public()`** correctly applied ✅; **Stripe raw-body + signature verification** correct ✅; **webhook idempotency** via `processedWebhookEvent` ✅; **no secrets in logs** (Pino redaction + Sentry scrubbing, no `console.*`) ✅ | OK |

---

## 6. Test Coverage

- **API (Jest):** 37 suites, **255 tests — all passing**. Coverage: **statements 82.1%, branches 62.8%, functions 77.7%, lines 81.8%**.
- **Web (Vitest):** 29 files, **124 tests — all passing**. **Coverage unmeasurable** — `@vitest/coverage-v8` not installed.
- **Combined: 379 tests, 0 failures.** (The ERROR lines in the API run are intentional error-path logs inside passing tests.)
- **No failing test files.** Zero e2e specs; 16/19 controllers lack controller-level tests.

**Top untested / lowest-coverage (highest risk):**
1. `chat/conversations.service.ts` — 88 lines, **22.7%**
2. `chat/chat.service.ts` — 982 lines, 67% (~320 uncovered)
3. `common/pipes/zod-validation.pipe.ts` — **55.5%**
4. `billing/providers/stripe.provider.ts` — 68%
5. `market/market.service.ts` — 74.6%

---

## 7. Build & Type Safety

- **API build** (`nest build`): clean ✅
- **Web build** (`next build`): success, 19 pages, **0 type errors** ✅
- **Typecheck** (`tsc --noEmit ×4`): **0 errors** ✅
- **Lint** (`eslint .`): **FAILS, exit 1** — 10 × `'self' is not defined` (no-undef) in `apps/web/public/sw.js` + 1 unused-var warning. Only lint failure in the repo; needs a `serviceworker` env override.
- **Suppressions:** 6 `eslint-disable` for `no-explicit-any`, **all in web test files**. Zero `@ts-ignore`/`@ts-expect-error` in source.
- **`any` usages:** 6, **all in web test mocks**. None in production source.
- Build warning: Next.js ESLint plugin not detected (cosmetic).

---

## 8. Infrastructure

**Render (API)** — from `render.yaml`:
- Plan: **`starter`** ($7/mo, always-on; free tier avoided for cold-starts)
- `preDeployCommand`: ✅ `prisma migrate deploy`
- Health check: ✅ `/api/v1/health` → `{status:'ok'}` (matches controller)
- Env names declared (incl. generated JWT secrets, wired `REDIS_URL`, `sync:false` `DATABASE_URL`, all provider keys)

**Vercel (Web):**
- No `vercel.json` in repo — config in dashboard. Documented build: `pnpm turbo run build --filter=finby-web`, root `apps/web`. **Cannot verify dashboard from repo.**
- `chat.finby.app` referenced in `render.yaml` + `docs/DEPLOY.md`; **actual domain/SSL attachment unverifiable from repo.**
- Sentry/PostHog `NEXT_PUBLIC_*` vars referenced in code but not in DEPLOY.md (silently no-op if unset).

**Redis:**
- **Actively used** as TTL cache for FX rates (`fx.service.ts:50`) and market quotes (`market.service.ts:34`). Not used for throttler/queues.
- Free 25MB Key Value: **low risk** — usage scales with symbols/currency pairs, not users; `allkeys-lru` policy.

---

## 9. UX Journey Status

| Journey | Status | Gap |
|---|---|---|
| 1. Onboarding | **Partial** | No post-register welcome screen — register lands directly on `/chat`. (Onboarding carousel is pre-login only.) Verify-email page wired correctly. |
| 2. Core value loop | **Complete** | Chat → AI confirm → transactions list → dashboard all wired |
| 3. Budget flow | **Partial** | **No budget-creation UI** (chat-only by design); **75% alert has no in-app surface** — relies on backend push + user opt-in; dashboard only colors the bar |
| 4. Upgrade flow | **Complete** | Full path wired to Stripe. **Caveat:** `UpgradeGate` wired to only **one** feature (multi-currency); chat daily-limit 429 shows a notice with no upgrade CTA |
| 5. Password recovery | **Complete** | forgot → email → reset → login all wired |

---

## 10. Known Issues & Tech Debt

- **TODO/FIXME/HACK/XXX:** none real — 2 false positives in test fixtures.
- **Commented-out code blocks >5 lines:** none.
- **Dead/unwired code:** `analytics.topMerchants` implemented but no route; `UNUSUAL_SPEND`/`MONTHLY_SUMMARY`/`AI_COACHING_NUDGE`/`PORTFOLIO_INSIGHT` alert types defined in schema but no generator emits them (anomaly detection never built); dead summary branch in `llm.system-prompt.ts:42`.
- **anomaly-detection.job invalid alertType bug:** **NOT present** — no `*.job.ts` files exist; the only alert writer emits valid budget enum values only. Feature was removed/never built.
- `sw.js` lint errors (see §7).

---

# MVP READINESS SCORECARD

| Dimension | Score (1-5) | Notes |
|---|---|---|
| Feature completeness | **4.5** | Core loop, auth, billing, PWA, email, push all built; minor gaps (AI context omits balances, budget-create UI, in-app alerts) |
| Security | **3** | Strong fundamentals (rotation, redaction, webhook verify, enumeration protection) undercut by **no rate limiting** and **no helmet** |
| Test coverage | **3.5** | 379 passing, 82% API statements; but 63% branches, no web coverage tooling, no e2e, chat module thin |
| Build health | **4** | Clean builds, 0 TS errors; lint blocked only by `sw.js` |
| Infrastructure | **4** | Render solid (health, migrations, starter plan); Redis used; Vercel/domain unverifiable from repo |
| UX completeness | **4** | 3 journeys complete, 2 partial with clear, non-blocking gaps |
| **Overall** | **3.8** | **Genuinely close. Two security items are the only hard blockers.** |

---

## GO / NO-GO Recommendation

### 🟡 GO WITH CONDITIONS

The product is functionally launch-ready — the core value loop, auth, billing, and infra are real and tested (379 green tests, both apps build, schema valid). The gap is a small, sharply-defined set of pre-launch hardening items, dominated by two security must-fixes.

### Blockers (must fix before launch)
1. **Add rate limiting** on `login`, `forgot-password`, `reset-password`, `resend-verification`, `refresh` (`@nestjs/throttler`). Today these are brute-forceable / mail-bombable. *(HIGH)*
2. **Add `helmet()`** in `main.ts` for baseline security headers. *(HIGH)*
3. **Fix the `sw.js` ESLint failure** — `pnpm lint` exits 1, which will fail CI/Vercel if lint gates the build. *(blocks clean pipeline)*
4. **Assert Stripe secrets + `WEB_URL` in production** (env-schema `superRefine` when `NODE_ENV==='production'`) so a misconfigured billing/CORS deploy fails loudly instead of booting "healthy." *(MEDIUM)*

### Launch-safe deferrals (fix post-launch)
1. Make `Transaction → Account` `onDelete` explicit (`Restrict`) to protect ledger history.
2. Add indexes on `Subscription` provider IDs before subscriber volume grows.
3. Install `@vitest/coverage-v8` + add controller/e2e tests for the chat module (lowest coverage) and route guards.
4. Inject account balances + recent transactions into AI context (currently on-demand only).
5. Add an in-app surface for budget alerts; broaden `UpgradeGate` beyond multi-currency (esp. the chat 429 CTA).
6. Add a post-register welcome step; consider a minimal budget-create UI.
7. Add `SENTRY_DSN`/PostHog/`LOG_LEVEL` to `.env.example`; remove dead code (`topMerchants` route or the unwired alert enums + summary branch).

### Strengths worth calling out
- **Auth is properly done** — bcrypt, rotated refresh tokens, sha256 reset tokens, all-session revocation on reset, real account-enumeration protection.
- **Stripe integration is correct** — raw-body signature verification, idempotency table, fails closed, customer portal, and Paystack/Lemon Squeezy retained as fallbacks.
- **Chat/AI subsystem is sophisticated** — agentic tool loop, dedup guard, confidence-gated drafts, and a genuinely-shipped tiered memory model (FREE eviction / PRO+ LLM compression) wired end-to-end.
- **Logging hygiene** — Pino field redaction + Sentry PII scrubbing, zero `console.*`, no secrets in logs.
- **Clean codebase** — 0 TS errors, no real TODOs, no commented-out code, `any` confined to test mocks.

Fix the four blockers (realistically a few hours of work — throttler module, helmet one-liner, `sw.js` eslint env, and one env-schema refine) and this is a **GO**.
