# Observability Foundation (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Sentry error+performance tracking (NestJS API + Next.js web), structured `nestjs-pino` logging, a PII-scrubbing safety layer, and external uptime monitoring — enabled in production only, at $0/mo.

**Architecture:** Sentry initialises before the Nest app boots (`instrument.ts`) and captures only 5xx/unknown errors via the *existing* global exception filter; `nestjs-pino` becomes the app logger with request-id correlation and field redaction. The web app uses `@sentry/nextjs` App-Router instrumentation. A shared, unit-tested `scrubEvent()` (`beforeSend`) plus pino `redact` guarantee no financial PII leaves our infra. All instrumentation no-ops when its DSN env var is unset.

**Tech Stack:** `@sentry/nestjs`, `@sentry/nextjs`, `nestjs-pino` + `pino`/`pino-http`/`pino-pretty`, Zod env schema, Jest (API), Vitest+jsdom (web).

**Spec:** `docs/2026-06-07-observability-phase1-design.md`

**Conventions (from the repo):**
- API tests: `cd apps/api && pnpm exec jest` (NOT `pnpm test`). Single: `pnpm --filter finby-api exec jest <pattern>`.
- Web tests: `pnpm --filter finby-web exec vitest run`. Typecheck: `pnpm --filter <pkg> exec tsc --noEmit`.
- Conventional commits, **NO AI-attribution trailers**.
- Branch already created: `feat/observability-phase1` (spec committed at `26c7488`).

---

## File Structure

**API (`apps/api/`)**
- Create `src/instrument.ts` — Sentry init (guarded by `SENTRY_DSN`), exports `initSentry()`.
- Create `src/observability/scrub.ts` — pure `scrubEvent()` + `DENY_KEYS`.
- Create `src/observability/scrub.spec.ts` — tests.
- Create `src/instrument.spec.ts` — `initSentry()` guard test.
- Modify `src/main.ts` — import `./instrument` first; `bufferLogs: true`; `app.useLogger(...)`.
- Modify `src/app.module.ts` — add `SentryModule.forRoot()` + `LoggerModule.forRoot(...)`.
- Modify `src/common/filters/http-exception.filter.ts` — `Sentry.captureException` on 5xx branch.
- Modify `src/common/filters/http-exception.filter.spec.ts` — assert capture behavior.
- Modify `src/config/env.schema.ts` — `SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE`, `LOG_LEVEL`.

**Web (`apps/web/`)**
- Create `src/lib/observability/scrub.ts` + `src/lib/observability/scrub.test.ts`.
- Create `src/sentry.server.config.ts`, `src/sentry.edge.config.ts`, `src/instrumentation.ts`, `src/instrumentation-client.ts`, `src/app/global-error.tsx`.
- Modify `next.config.mjs` — wrap with `withSentryConfig`.

---

## Task 1: Install API dependencies

**Files:** `apps/api/package.json` (via pnpm)

- [ ] **Step 1: Add runtime + dev deps**

Run:
```bash
cd /home/unicorn/Documents/finby
pnpm --filter finby-api add @sentry/nestjs nestjs-pino pino pino-http
pnpm --filter finby-api add -D pino-pretty
```

- [ ] **Step 2: Verify install + typecheck**

Run: `pnpm --filter finby-api exec tsc --noEmit`
Expected: exit 0 (no usages yet, just dependency resolution).

- [ ] **Step 3: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "build(api): add sentry + pino observability deps"
```

---

## Task 2: API env schema additions

**Files:** Modify `apps/api/src/config/env.schema.ts`

- [ ] **Step 1: Add the three optional vars**

In `envSchema`, after the `WEB_URL` line (App section), add:
```ts
  // Observability (Phase 1) — optional; Sentry no-ops when SENTRY_DSN is unset.
  SENTRY_DSN: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter finby-api exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/config/env.schema.ts
git commit -m "feat(api): add observability env vars (SENTRY_DSN, sample rate, LOG_LEVEL)"
```

---

## Task 3: API PII scrubber (`scrubEvent`)

**Files:**
- Create: `apps/api/src/observability/scrub.ts`
- Test: `apps/api/src/observability/scrub.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { scrubEvent, DENY_KEYS } from './scrub';
import type { ErrorEvent } from '@sentry/nestjs';

function makeEvent(over: Partial<ErrorEvent> = {}): ErrorEvent {
  return { type: undefined, ...over } as ErrorEvent;
}

describe('scrubEvent', () => {
  it('drops request body, query string, cookies and auth headers', () => {
    const event = makeEvent({
      request: {
        url: 'https://api.finby.app/x',
        data: { amount: '12.00' },
        query_string: 'q=1',
        cookies: { sid: 'abc' },
        headers: { Authorization: 'Bearer xyz', cookie: 'sid=abc', 'user-agent': 'jest' },
      },
    });
    const out = scrubEvent(event, {})!;
    expect(out.request!.data).toBeUndefined();
    expect(out.request!.query_string).toBeUndefined();
    expect(out.request!.cookies).toBeUndefined();
    expect(out.request!.headers!.Authorization).toBeUndefined();
    expect(out.request!.headers!.cookie).toBeUndefined();
    expect(out.request!.headers!['user-agent']).toBe('jest');
  });

  it('reduces user context to id only', () => {
    const out = scrubEvent(makeEvent({ user: { id: 'u1', email: 'a@b.com', username: 'a' } }), {})!;
    expect(out.user).toEqual({ id: 'u1' });
  });

  it('recursively redacts deny-listed financial/PII keys in extra/contexts', () => {
    const out = scrubEvent(
      makeEvent({
        extra: { tx: { amount: '99.50', merchant: 'KFC', note: 'ok' }, accountNumber: 'FB-123' },
        contexts: { state: { balance: '500.00' } } as ErrorEvent['contexts'],
      }),
      {},
    )!;
    const tx = (out.extra!.tx as Record<string, unknown>);
    expect(tx.amount).toBe('[redacted]');
    expect(tx.merchant).toBe('[redacted]');
    expect(tx.note).toBe('ok');
    expect(out.extra!.accountNumber).toBe('[redacted]');
    expect((out.contexts!.state as Record<string, unknown>).balance).toBe('[redacted]');
  });

  it('exposes the deny list and matches case-insensitively', () => {
    expect(DENY_KEYS).toContain('amount');
    const out = scrubEvent(makeEvent({ extra: { Amount: '1', AMOUNTBASE: '2' } }), {})!;
    expect(out.extra!.Amount).toBe('[redacted]');
    expect(out.extra!.AMOUNTBASE).toBe('[redacted]');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm exec jest scrub.spec`
Expected: FAIL — `Cannot find module './scrub'`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/observability/scrub.ts`:
```ts
import type { ErrorEvent, EventHint } from '@sentry/nestjs';

/** Keys (lower-cased) whose values must never be transmitted. */
export const DENY_KEYS = [
  'amount', 'amountbase', 'amountlimit', 'amountspent', 'balance', 'pricebase',
  'merchant', 'accountnumber', 'email', 'password', 'token', 'secret', 'refreshtoken',
];

function redactDeep(value: unknown, depth = 0): unknown {
  if (value == null || depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = DENY_KEYS.includes(k.toLowerCase()) ? '[redacted]' : redactDeep(v, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Sentry `beforeSend` hook: strips request payloads/headers, reduces user
 * context to a UUID, and recursively redacts financial/PII keys. Total —
 * never throws; on any internal error it drops the event (returns null).
 */
export function scrubEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  try {
    if (event.request) {
      delete event.request.data;
      delete event.request.query_string;
      delete event.request.cookies;
      const h = event.request.headers;
      if (h) {
        for (const key of Object.keys(h)) {
          if (['authorization', 'cookie'].includes(key.toLowerCase())) delete h[key];
        }
      }
    }
    if (event.user) {
      event.user = event.user.id ? { id: event.user.id } : undefined;
    }
    if (event.extra) event.extra = redactDeep(event.extra) as ErrorEvent['extra'];
    if (event.contexts) event.contexts = redactDeep(event.contexts) as ErrorEvent['contexts'];
    return event;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm exec jest scrub.spec`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/observability/scrub.ts apps/api/src/observability/scrub.spec.ts
git commit -m "feat(api): PII-scrubbing beforeSend hook for sentry"
```

---

## Task 4: API Sentry init (`instrument.ts`)

**Files:**
- Create: `apps/api/src/instrument.ts`
- Test: `apps/api/src/instrument.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import * as Sentry from '@sentry/nestjs';
import { initSentry } from './instrument';

jest.mock('@sentry/nestjs', () => ({ init: jest.fn() }));

describe('initSentry', () => {
  const OLD = process.env;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD };
  });
  afterAll(() => {
    process.env = OLD;
  });

  it('does nothing when SENTRY_DSN is unset', () => {
    delete process.env.SENTRY_DSN;
    expect(initSentry()).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('initialises with PII off and a beforeSend hook when DSN is set', () => {
    process.env.SENTRY_DSN = 'https://k@o1.ingest.sentry.io/1';
    process.env.SENTRY_TRACES_SAMPLE_RATE = '0.25';
    expect(initSentry()).toBe(true);
    expect(Sentry.init).toHaveBeenCalledTimes(1);
    const opts = (Sentry.init as jest.Mock).mock.calls[0][0];
    expect(opts.sendDefaultPii).toBe(false);
    expect(opts.tracesSampleRate).toBe(0.25);
    expect(typeof opts.beforeSend).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm exec jest instrument.spec`
Expected: FAIL — `Cannot find module './instrument'`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/instrument.ts`:
```ts
import * as Sentry from '@sentry/nestjs';
import { scrubEvent } from './observability/scrub';

/**
 * Initialise Sentry for the API. No-ops (returns false) when SENTRY_DSN is
 * unset, so local/dev/test stay silent and only production reports.
 *
 * NOTE: this runs at the very top of main.ts, BEFORE ConfigModule loads the
 * .env file — so it reads real process.env. That is intentional: Sentry is a
 * production-only concern (DSN is set on the host, never in local .env).
 */
export function initSentry(): boolean {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  });
  return true;
}

// Side-effect init for the import-first requirement in main.ts.
initSentry();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm exec jest instrument.spec`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/instrument.ts apps/api/src/instrument.spec.ts
git commit -m "feat(api): guarded sentry init (prod-only, PII off)"
```

---

## Task 5: Wire pino logger + SentryModule + import order

**Files:**
- Modify `apps/api/src/main.ts`
- Modify `apps/api/src/app.module.ts`

- [ ] **Step 1: Update `main.ts`**

Make `import './instrument';` the **first** line, enable log buffering, and set the pino logger. Full file:
```ts
import './instrument';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // rawBody: true preserves the raw request bytes for webhook signature verification.
  // bufferLogs: true holds logs until the pino logger is attached below.
  const app = await NestFactory.create(AppModule, { rawBody: true, bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: process.env.WEB_URL ?? 'http://localhost:3000',
    credentials: true,
  });
  const port = process.env.PORT ?? process.env.API_PORT ?? 3001;
  await app.listen(port);
}

void bootstrap();
```

- [ ] **Step 2: Update `app.module.ts` imports**

Add the two imports at the top:
```ts
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { LoggerModule } from 'nestjs-pino';
import { SentryModule } from '@sentry/nestjs/setup';
```

Then add to the module's `imports: [...]` array (put `SentryModule.forRoot()` first so its request isolation wraps everything):
```ts
    SentryModule.forRoot(),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        // Reuse an inbound x-request-id or mint one; echo it on the response so
        // a log line, the response, and any Sentry event share the same id.
        genReqId: (req: IncomingMessage, res: ServerResponse) => {
          const incoming = req.headers['x-request-id'];
          const id = (Array.isArray(incoming) ? incoming[0] : incoming) ?? randomUUID();
          res.setHeader('x-request-id', id);
          return id;
        },
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body',
            'res.headers["set-cookie"]',
            '*.amount', '*.amountBase', '*.balance', '*.merchant',
            '*.accountNumber', '*.email', '*.password', '*.token',
          ],
          censor: '[redacted]',
        },
        // Pretty logs only in local dev; JSON to stdout in prod and tests.
        transport:
          process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
      },
    }),
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter finby-api exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Run the full API suite (nothing should regress)**

Run: `cd apps/api && pnpm exec jest`
Expected: PASS — all existing tests (216 at this point) green. (pino-pretty transport is off under NODE_ENV=test, so no worker is spawned.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/main.ts apps/api/src/app.module.ts
git commit -m "feat(api): wire nestjs-pino logger + SentryModule + request-id"
```

---

## Task 6: Capture 5xx errors in the existing exception filter

**Files:**
- Modify `apps/api/src/common/filters/http-exception.filter.ts`
- Modify `apps/api/src/common/filters/http-exception.filter.spec.ts`

- [ ] **Step 1: Write the failing test (add to the existing spec)**

Add a Sentry mock at the top of the spec file (below imports):
```ts
import * as Sentry from '@sentry/nestjs';
jest.mock('@sentry/nestjs', () => ({ captureException: jest.fn() }));
```

Add these cases inside the existing `describe`:
```ts
  it('reports unknown (5xx) errors to Sentry', () => {
    (Sentry.captureException as jest.Mock).mockClear();
    const filter = new HttpExceptionFilter();
    const host = makeHost(); // existing helper that builds an ArgumentsHost
    filter.catch(new Error('db exploded'), host);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('does NOT report expected HttpExceptions (4xx) to Sentry', () => {
    (Sentry.captureException as jest.Mock).mockClear();
    const filter = new HttpExceptionFilter();
    const host = makeHost();
    filter.catch(new ForbiddenException('nope'), host);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
```

> If the existing spec builds its `ArgumentsHost` inline rather than via a `makeHost()` helper, reuse that same construction here (it must provide `switchToHttp().getResponse()` returning an object with chainable `status().json()`, and `getRequest()` returning `{}`). Add `import { ForbiddenException } from '@nestjs/common';` if absent.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm exec jest http-exception.filter.spec`
Expected: FAIL — `Sentry.captureException` not called for the 5xx case (filter doesn't call it yet).

- [ ] **Step 3: Implement capture in the filter**

In `http-exception.filter.ts`, add the import:
```ts
import * as Sentry from '@sentry/nestjs';
```

Replace the existing unknown-error branch:
```ts
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }
```
with:
```ts
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
      // Only unexpected (5xx/unknown) errors reach Sentry — expected 4xx
      // HttpExceptions are handled in the branch above and never reported.
      const req = host.switchToHttp().getRequest<{ id?: string }>();
      Sentry.captureException(exception, { tags: { request_id: req?.id } });
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm exec jest http-exception.filter.spec`
Expected: PASS (existing cases + 2 new).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/filters/http-exception.filter.ts apps/api/src/common/filters/http-exception.filter.spec.ts
git commit -m "feat(api): report 5xx errors to sentry from the global filter"
```

---

## Task 7: Install web dependency

**Files:** `apps/web/package.json`

- [ ] **Step 1: Add @sentry/nextjs**

Run:
```bash
cd /home/unicorn/Documents/finby
pnpm --filter finby-web add @sentry/nextjs
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter finby-web exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "build(web): add @sentry/nextjs"
```

---

## Task 8: Web PII scrubber

**Files:**
- Create: `apps/web/src/lib/observability/scrub.ts`
- Test: `apps/web/src/lib/observability/scrub.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import type { ErrorEvent } from '@sentry/nextjs';
import { scrubEvent, DENY_KEYS } from './scrub';

const ev = (o: Partial<ErrorEvent> = {}): ErrorEvent => ({ type: undefined, ...o }) as ErrorEvent;

describe('scrubEvent (web)', () => {
  it('drops request data/headers and reduces user to id', () => {
    const out = scrubEvent(
      ev({
        request: { url: 'x', data: { amount: '5' }, cookies: { s: '1' }, headers: { Authorization: 'b', 'user-agent': 'v' } },
        user: { id: 'u1', email: 'a@b.com' },
      }),
      {},
    )!;
    expect(out.request!.data).toBeUndefined();
    expect(out.request!.cookies).toBeUndefined();
    expect(out.request!.headers!.Authorization).toBeUndefined();
    expect(out.request!.headers!['user-agent']).toBe('v');
    expect(out.user).toEqual({ id: 'u1' });
  });

  it('redacts deny-listed keys (case-insensitive) in extra', () => {
    expect(DENY_KEYS).toContain('balance');
    const out = scrubEvent(ev({ extra: { Balance: '9', ok: '1' } }), {})!;
    expect(out.extra!.Balance).toBe('[redacted]');
    expect(out.extra!.ok).toBe('1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-web exec vitest run src/lib/observability/scrub.test.ts`
Expected: FAIL — cannot resolve `./scrub`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/observability/scrub.ts` — identical logic to the API copy but importing web types:
```ts
import type { ErrorEvent, EventHint } from '@sentry/nextjs';

export const DENY_KEYS = [
  'amount', 'amountbase', 'amountlimit', 'amountspent', 'balance', 'pricebase',
  'merchant', 'accountnumber', 'email', 'password', 'token', 'secret', 'refreshtoken',
];

function redactDeep(value: unknown, depth = 0): unknown {
  if (value == null || depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = DENY_KEYS.includes(k.toLowerCase()) ? '[redacted]' : redactDeep(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function scrubEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  try {
    if (event.request) {
      delete event.request.data;
      delete event.request.query_string;
      delete event.request.cookies;
      const h = event.request.headers;
      if (h) {
        for (const key of Object.keys(h)) {
          if (['authorization', 'cookie'].includes(key.toLowerCase())) delete h[key];
        }
      }
    }
    if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
    if (event.extra) event.extra = redactDeep(event.extra) as ErrorEvent['extra'];
    if (event.contexts) event.contexts = redactDeep(event.contexts) as ErrorEvent['contexts'];
    return event;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-web exec vitest run src/lib/observability/scrub.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/observability/scrub.ts apps/web/src/lib/observability/scrub.test.ts
git commit -m "feat(web): PII-scrubbing beforeSend hook for sentry"
```

---

## Task 9: Web Sentry config files

**Files (all create):**
- `apps/web/src/sentry.server.config.ts`
- `apps/web/src/sentry.edge.config.ts`
- `apps/web/src/instrumentation.ts`
- `apps/web/src/instrumentation-client.ts`
- `apps/web/src/app/global-error.tsx`

- [ ] **Step 1: Server config**

`apps/web/src/sentry.server.config.ts`:
```ts
import * as Sentry from '@sentry/nextjs';
import { scrubEvent } from '@/lib/observability/scrub';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  enableLogs: false,
  beforeSend: scrubEvent,
});
```

- [ ] **Step 2: Edge config**

`apps/web/src/sentry.edge.config.ts`:
```ts
import * as Sentry from '@sentry/nextjs';
import { scrubEvent } from '@/lib/observability/scrub';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  enableLogs: false,
  beforeSend: scrubEvent,
});
```

- [ ] **Step 3: Server/edge registration**

`apps/web/src/instrumentation.ts`:
```ts
import * as Sentry from '@sentry/nextjs';

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
```

- [ ] **Step 4: Client init (NO replay, PII off)**

`apps/web/src/instrumentation-client.ts`:
```ts
import * as Sentry from '@sentry/nextjs';
import { scrubEvent } from '@/lib/observability/scrub';

// Session replay deliberately omitted — it can capture on-screen amounts.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  enableLogs: false,
  beforeSend: scrubEvent,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
```

- [ ] **Step 5: Global error boundary**

`apps/web/src/app/global-error.tsx`:
```tsx
'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-app items-center justify-center bg-canvas text-ink">
        <div className="text-center">
          <p className="text-lg font-semibold">Something went wrong.</p>
          <p className="mt-1 text-sm text-muted">Please refresh and try again.</p>
        </div>
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter finby-web exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/sentry.server.config.ts apps/web/src/sentry.edge.config.ts apps/web/src/instrumentation.ts apps/web/src/instrumentation-client.ts apps/web/src/app/global-error.tsx
git commit -m "feat(web): sentry app-router instrumentation (no replay, PII off)"
```

---

## Task 10: Wrap next.config with withSentryConfig

**Files:** Modify `apps/web/next.config.mjs`

- [ ] **Step 1: Read the current config first**

Run: `cat apps/web/next.config.mjs` — note the current default export (call its value `nextConfig`).

- [ ] **Step 2: Wrap the export**

Add the import at the top:
```js
import { withSentryConfig } from '@sentry/nextjs';
```
Replace the final `export default <nextConfig>;` with:
```js
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT ?? 'finby-web',
  silent: !process.env.CI,
  authToken: process.env.SENTRY_AUTH_TOKEN, // source-map upload; absent locally → skipped
  telemetry: false,
});
```
> If the current file exports an inline object literal, first assign it to `const nextConfig = { ... };` so the wrapper has a named value to receive.

- [ ] **Step 3: Typecheck + full web suite**

Run:
```bash
pnpm --filter finby-web exec tsc --noEmit
pnpm --filter finby-web exec vitest run
```
Expected: tsc exit 0; vitest all green (92 tests at this point).

- [ ] **Step 4: Commit**

```bash
git add apps/web/next.config.mjs
git commit -m "build(web): wrap next config with withSentryConfig"
```

---

## Task 11: Final verification

**Files:** none (verification only)

- [ ] **Step 1: API suite + typecheck**

Run:
```bash
cd /home/unicorn/Documents/finby/apps/api && pnpm exec jest && pnpm exec tsc --noEmit
```
Expected: all API tests green (≈220), tsc exit 0.

- [ ] **Step 2: Web suite + typecheck**

Run:
```bash
cd /home/unicorn/Documents/finby
pnpm --filter finby-web exec vitest run && pnpm --filter finby-web exec tsc --noEmit
```
Expected: all web tests green (≈92), tsc exit 0.

- [ ] **Step 3: Lint the changed files**

Run:
```bash
cd /home/unicorn/Documents/finby
pnpm --filter finby-api exec eslint src/instrument.ts src/observability src/common/filters/http-exception.filter.ts
pnpm --filter finby-web exec eslint src/lib/observability src/instrumentation.ts src/instrumentation-client.ts
```
Expected: exit 0 for both.

- [ ] **Step 4: Production build smoke (catches Sentry build-plugin issues)**

> Only if `next dev` is NOT running (shared `.next`). 
Run: `pnpm --filter finby-web build`
Expected: build succeeds (Sentry plugin runs; source-map upload skipped without auth token — that's fine).

- [ ] **Step 5: Commit any lint fixes (if needed), then this task is done.**

---

## Deployment & external setup (post-merge, user actions)

These are **not code tasks** — do them after the branch is merged so prod activates the instrumentation:

1. **Sentry auth token:** create an org-level auth token with `project:releases` scope (for source-map upload).
2. **Render (`finby-api`) env:** set `SENTRY_DSN` (API project DSN), optional `SENTRY_TRACES_SAMPLE_RATE`, `LOG_LEVEL=info`. Redeploy.
3. **Vercel (`finby-web`) env:** set `NEXT_PUBLIC_SENTRY_DSN` (web project DSN), `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT=finby-web`. Redeploy.
4. **Verify:** trigger a test error on each (e.g. a throwaway route / a thrown error) → confirm it appears in the right Sentry project with a readable stack trace and **no** financial fields in the payload.
5. **Confirm logs:** Render logs are JSON lines carrying `reqId`.
6. **UptimeRobot:** create 2 monitors — `GET https://api.finby.app/api/v1/health` and `https://chat.finby.app` — 5-min interval, email alert. (Confirm monitor type during this step.)
7. **Sentry alert rules:** notify on new issue + error-rate spike (email).

---

## Self-Review (completed by plan author)

- **Spec coverage:** §4.1 Sentry init → T4; §4.2 filter capture → T6; §4.3 pino → T5; §4.4 web Sentry → T9/T10; §4.5 scrubbing → T3/T8; §5 env/config → T2 + deployment §; §6 uptime → deployment §; §8 testing → tests in T3/T4/T6/T8; rollout §9 → T11 + deployment §. All covered.
- **Placeholder scan:** no TBD/TODO; all code blocks complete. The two "if the existing spec/config differs" notes point to concrete fallbacks, not placeholders.
- **Type consistency:** `scrubEvent(event, hint)` + `DENY_KEYS` identical across API/web; `initSentry(): boolean`; filter reads `req.id` set by pino `genReqId`; `request_id` tag matches the `x-request-id` header source.
