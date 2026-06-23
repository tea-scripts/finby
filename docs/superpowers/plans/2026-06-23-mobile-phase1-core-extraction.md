# Mobile Phase 1 — Extract `@finby/core` Kernel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a new framework-agnostic `@finby/core` package holding the platform-agnostic transport + formatting kernel (HTTP client, authed/refresh client, SSE parser, formatters), and rewire the web app to consume it — with zero behavior change and the web app green throughout.

**Architecture:** The portable kernel moves into `packages/core`. Platform-specific concerns (the API base URL from `NEXT_PUBLIC_*`, the Zustand/localStorage token state) stay in `apps/web` and are injected into the core via factory functions and callbacks. The web modules `api-client.ts`, `sse.ts`, `format.ts`, and `store.ts` keep their exact public export surface by re-exporting from / delegating to core, so the ~29 existing consumer sites need no changes.

**Tech Stack:** TypeScript (strict), pnpm workspaces, Turbo, Vitest. Core is a pure-TS CommonJS package mirroring `@finby/shared`.

## Global Constraints

- Node `>=20`; pnpm `10.28.1` (`packageManager` in root `package.json`).
- Commit messages: NO AI-attribution trailers, NO "Generated with" boilerplate. One logical change per commit (atomic).
- TypeScript strict mode + `noUncheckedIndexedAccess` (inherited from `tsconfig.base.json`).
- `@finby/core` must NEVER import `localStorage`, `window`, `next/*`, `zustand`, React, or any React Native API. Platform pieces are injected.
- Keep files focused; mirror the existing `@finby/shared` package layout and the web Vitest conventions.
- Web app must stay green after every task: `pnpm --filter finby-web typecheck` and `pnpm --filter finby-web test` pass.

---

### Task 1: Scaffold the `@finby/core` package

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/vitest.config.ts`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/src/sanity.test.ts`

**Interfaces:**
- Consumes: nothing (root pnpm workspace already globs `packages/*`).
- Produces: an installable `@finby/core` workspace package whose build emits `dist/index.js` + `dist/index.d.ts`, and a `test` script runnable via `pnpm --filter @finby/core test`.

- [ ] **Step 1: Create the package manifest**

`packages/core/package.json`:

```json
{
  "name": "@finby/core",
  "version": "0.0.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -p tsconfig.json --watch",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@finby/shared": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create the TypeScript config**

`packages/core/tsconfig.json` — mirrors `@finby/shared` but adds the `DOM` lib so `fetch`/`Response`/`RequestInit`/`FormData`/`URLSearchParams` typecheck (these are provided at runtime by both browsers and React Native; `DOM` here is types-only, no runtime dependency):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node",
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "src/**/*.test.ts"]
}
```

- [ ] **Step 3: Create the Vitest config**

`packages/core/vitest.config.ts` (node environment — core is pure logic, no DOM rendering):

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Create the entry point and a sanity test**

`packages/core/src/index.ts`:

```ts
// @finby/core — framework-agnostic transport + formatting kernel shared by
// apps/web and apps/mobile. Never import platform APIs here; inject them.
export const CORE_PACKAGE = '@finby/core';
```

`packages/core/src/sanity.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CORE_PACKAGE } from './index';

describe('@finby/core', () => {
  it('exposes its package marker', () => {
    expect(CORE_PACKAGE).toBe('@finby/core');
  });
});
```

- [ ] **Step 5: Install and verify the package wires into the workspace**

Run: `pnpm install`
Expected: completes; `@finby/core` recognized as a workspace package (no errors).

- [ ] **Step 6: Run the build and test**

Run: `pnpm --filter @finby/core build && pnpm --filter @finby/core test`
Expected: build emits `packages/core/dist/index.js` and `index.d.ts`; test run shows `1 passed`.

- [ ] **Step 7: Commit**

```bash
git add packages/core pnpm-lock.yaml
git commit -m "feat(core): scaffold @finby/core package"
```

---

### Task 2: Port the HTTP client (`ApiError` + `apiFetch`) into core

**Files:**
- Create: `packages/core/src/http.ts`
- Create: `packages/core/src/http.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `apps/web/src/lib/api-client.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `class ApiError extends Error` with `(status: number, code: string, message: string, details?: unknown)`.
  - `interface HttpClient { baseUrl: string; apiFetch<T>(path: string, init?: RequestInit): Promise<T> }`.
  - `function createHttpClient(config: { baseUrl: string }): HttpClient`.
  - `ApiError`, `createHttpClient`, `HttpClient` re-exported from `@finby/core`.

- [ ] **Step 1: Write the failing test**

`packages/core/src/http.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createHttpClient } from './http';

const BASE = 'https://api.test/v1';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(impl: typeof fetch) {
  vi.stubGlobal('fetch', vi.fn(impl));
}

describe('createHttpClient.apiFetch', () => {
  it('parses a JSON success body and prefixes the base URL', async () => {
    stubFetch(async (url) => {
      expect(url).toBe(`${BASE}/ping`);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const http = createHttpClient({ baseUrl: BASE });
    await expect(http.apiFetch<{ ok: boolean }>('/ping')).resolves.toEqual({ ok: true });
  });

  it('throws ApiError carrying status/code/message on a non-ok response', async () => {
    stubFetch(async () =>
      new Response(JSON.stringify({ error: 'BAD', message: 'nope' }), { status: 422 }),
    );
    const http = createHttpClient({ baseUrl: BASE });
    await expect(http.apiFetch('/x')).rejects.toMatchObject({
      status: 422,
      code: 'BAD',
      message: 'nope',
    });
  });

  it('throws a NETWORK ApiError when fetch rejects', async () => {
    stubFetch(async () => {
      throw new Error('offline');
    });
    const http = createHttpClient({ baseUrl: BASE });
    await expect(http.apiFetch('/x')).rejects.toMatchObject({ status: 0, code: 'NETWORK' });
  });

  it('does not force JSON Content-Type for FormData bodies', async () => {
    let sentHeaders: Record<string, string> = {};
    stubFetch(async (_url, init) => {
      sentHeaders = (init?.headers ?? {}) as Record<string, string>;
      return new Response('null', { status: 200 });
    });
    const http = createHttpClient({ baseUrl: BASE });
    await http.apiFetch('/upload', { method: 'POST', body: new FormData() });
    expect(sentHeaders['Content-Type']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @finby/core test`
Expected: FAIL — `Cannot find module './http'`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/http.ts` (logic ported verbatim from `apps/web/src/lib/api-client.ts`, with `baseUrl` injected instead of read from `process.env`):

```ts
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface HttpClient {
  readonly baseUrl: string;
  apiFetch<T>(path: string, init?: RequestInit): Promise<T>;
}

/** Stateless fetch against the Finby API. Knows nothing about auth state. */
export function createHttpClient(config: { baseUrl: string }): HttpClient {
  const { baseUrl } = config;

  async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          // FormData bodies (file uploads) must let the platform set the
          // multipart Content-Type with its boundary — never force JSON there.
          ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
          ...(init.headers ?? {}),
        },
      });
    } catch {
      throw new ApiError(0, 'NETWORK', "We couldn't reach Finby. Please check your connection and try again.");
    }

    const text = await res.text();
    const data: unknown = text ? JSON.parse(text) : null;

    if (!res.ok) {
      const body = (data ?? {}) as { error?: string; message?: string; details?: unknown };
      throw new ApiError(
        res.status,
        body.error ?? 'ERROR',
        body.message ?? 'Something went wrong. Please try again.',
        body.details,
      );
    }
    return data as T;
  }

  return { baseUrl, apiFetch };
}
```

- [ ] **Step 4: Export from the package entry point**

Replace `packages/core/src/index.ts` contents with:

```ts
// @finby/core — framework-agnostic transport + formatting kernel shared by
// apps/web and apps/mobile. Never import platform APIs here; inject them.
export const CORE_PACKAGE = '@finby/core';

export { ApiError, createHttpClient } from './http';
export type { HttpClient } from './http';
```

- [ ] **Step 5: Run core tests to verify they pass**

Run: `pnpm --filter @finby/core test`
Expected: PASS — all `http` tests green (sanity test still green).

- [ ] **Step 6: Rewire the web `api-client.ts` to delegate to core**

Replace `apps/web/src/lib/api-client.ts` contents with (preserves the exact existing exports `API_BASE`, `ApiError`, `apiFetch` so all 14 importers are untouched):

```ts
import { createHttpClient, ApiError } from '@finby/core';

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export { ApiError };

const http = createHttpClient({ baseUrl: API_BASE });

/** Low-level fetch against the Finby API. Knows nothing about auth state. */
export function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  return http.apiFetch<T>(path, init);
}
```

- [ ] **Step 7: Rebuild core and verify the web app stays green**

Run: `pnpm --filter @finby/core build && pnpm --filter finby-web typecheck && pnpm --filter finby-web test`
Expected: all PASS (core dist is regenerated so web resolves the new exports; web tests unchanged and green).

- [ ] **Step 8: Commit**

```bash
git add packages/core apps/web/src/lib/api-client.ts
git commit -m "refactor(core): move HTTP client into @finby/core, web delegates"
```

---

### Task 3: Move the SSE frame parser into core

**Files:**
- Move (git mv): `apps/web/src/lib/sse.ts` → `packages/core/src/sse.ts`
- Move (git mv): `apps/web/src/lib/sse.test.ts` → `packages/core/src/sse.test.ts`
- Modify: `packages/core/src/index.ts`
- Create: `apps/web/src/lib/sse.ts` (new thin re-export at the original path)

**Interfaces:**
- Consumes: nothing.
- Produces: `interface ParsedSseEvent { event: string; data: string }` and `function parseSseFrames(buffer: string): { events: ParsedSseEvent[]; rest: string }`, re-exported from `@finby/core`.

- [ ] **Step 1: Move the existing test into core**

Run:
```bash
git mv apps/web/src/lib/sse.test.ts packages/core/src/sse.test.ts
```
The import line at the top of the moved file, `import { parseSseFrames } from './sse';`, stays valid in its new location once the implementation moves in Step 3 — no edit needed.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @finby/core test`
Expected: FAIL — `Cannot find module './sse'` (the implementation has not moved yet).

- [ ] **Step 3: Move the implementation into core (preserves git history)**

Run:
```bash
git mv apps/web/src/lib/sse.ts packages/core/src/sse.ts
```
The file content is unchanged — `ParsedSseEvent` and `parseSseFrames` are already pure (no platform imports).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @finby/core test`
Expected: PASS.

- [ ] **Step 5: Export from the package entry point**

Add to `packages/core/src/index.ts`:

```ts
export { parseSseFrames } from './sse';
export type { ParsedSseEvent } from './sse';
```

- [ ] **Step 6: Recreate the web `sse.ts` as a thin re-export**

The `git mv` in Step 3 removed `apps/web/src/lib/sse.ts`. Create it again at the same path with only:

```ts
export { parseSseFrames } from '@finby/core';
export type { ParsedSseEvent } from '@finby/core';
```

This keeps any web consumer that imports from `./sse` working unchanged.

- [ ] **Step 7: Rebuild core and verify web stays green**

Run: `pnpm --filter @finby/core build && pnpm --filter finby-web typecheck && pnpm --filter finby-web test`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/core apps/web/src/lib/sse.ts
git commit -m "refactor(core): move SSE frame parser into @finby/core"
```

---

### Task 4: Move display formatters into core

**Files:**
- Move (git mv): `apps/web/src/lib/format.ts` → `packages/core/src/format.ts`
- Move (git mv): `apps/web/src/lib/format.test.ts` → `packages/core/src/format.test.ts`
- Modify: `packages/core/src/index.ts`
- Create: `apps/web/src/lib/format.ts` (new thin re-export at the original path)

**Interfaces:**
- Consumes: `@finby/shared` (`CURRENCIES`, `CurrencyDisplay`, `DateFormat`, `NumberFormat`).
- Produces (re-exported from `@finby/core`): `money(amount, currency, opts?)`, `shortDate(iso, fmt?)`, `timeOfDay(iso)`, `dayKey(iso)`, `dayLabel(iso)`, `currentMonthRange()`.

- [ ] **Step 1: Move the existing test into core**

Run:
```bash
git mv apps/web/src/lib/format.test.ts packages/core/src/format.test.ts
```
The import line `import { money, shortDate } from './format';` stays valid in the new location once the implementation moves in Step 3 — no edit needed.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @finby/core test`
Expected: FAIL — `Cannot find module './format'` (the implementation has not moved yet).

- [ ] **Step 3: Move the implementation into core (preserves git history)**

Run:
```bash
git mv apps/web/src/lib/format.ts packages/core/src/format.ts
```
The file content is unchanged — it already imports only from `@finby/shared`, which core depends on.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @finby/core test`
Expected: PASS.

- [ ] **Step 5: Export from the package entry point**

Add to `packages/core/src/index.ts`:

```ts
export { money, shortDate, timeOfDay, dayKey, dayLabel, currentMonthRange } from './format';
```

- [ ] **Step 6: Recreate the web `format.ts` as a thin re-export**

The `git mv` in Step 3 removed `apps/web/src/lib/format.ts`. Create it again at the same path with only:

```ts
export { money, shortDate, timeOfDay, dayKey, dayLabel, currentMonthRange } from '@finby/core';
```

This keeps consumers like `use-formatters.ts` (which import from `./format`) working unchanged.

- [ ] **Step 7: Rebuild core and verify web stays green**

Run: `pnpm --filter @finby/core build && pnpm --filter finby-web typecheck && pnpm --filter finby-web test`
Expected: all PASS (note: `use-formatters.ts` and any other consumers import from `./format`, which still resolves).

- [ ] **Step 8: Commit**

```bash
git add packages/core apps/web/src/lib/format.ts
git commit -m "refactor(core): move display formatters into @finby/core"
```

---

### Task 5: Extract the authed/refresh client into core

**Files:**
- Create: `packages/core/src/authed.ts`
- Create: `packages/core/src/authed.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `apps/web/src/lib/store.ts`

**Interfaces:**
- Consumes: `HttpClient`, `ApiError` from core's `http.ts`.
- Produces (re-exported from `@finby/core`):
  - `interface TokenPair { accessToken: string; refreshToken: string }`
  - `interface AuthedClientConfig { http: HttpClient; getAccessToken: () => string | null; getRefreshToken: () => string | null; setTokens: (pair: TokenPair) => void; onAuthCleared: () => void; refreshPath?: string }`
  - `interface AuthedClient { authed<T>(path: string, init?: RequestInit): Promise<T>; authedStream(path: string, init?: RequestInit): Promise<Response>; tryRefresh(): Promise<boolean> }`
  - `function createAuthedClient(config: AuthedClientConfig): AuthedClient`

- [ ] **Step 1: Write the failing test**

`packages/core/src/authed.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { ApiError, type HttpClient } from './http';
import { createAuthedClient, type TokenPair } from './authed';

function makeHttp(responder: <T>(path: string, init?: RequestInit) => Promise<T>): HttpClient {
  return { baseUrl: 'https://api.test/v1', apiFetch: vi.fn(responder) as HttpClient['apiFetch'] };
}

describe('createAuthedClient.authed', () => {
  it('attaches the bearer token and returns the body', async () => {
    const http = makeHttp(async (_p, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer access-1');
      return { value: 1 } as unknown;
    });
    const client = createAuthedClient({
      http,
      getAccessToken: () => 'access-1',
      getRefreshToken: () => 'refresh-1',
      setTokens: () => {},
      onAuthCleared: () => {},
    });
    await expect(client.authed<{ value: number }>('/me')).resolves.toEqual({ value: 1 });
  });

  it('refreshes once on a 401 then retries the original request', async () => {
    let access = 'stale';
    const calls: string[] = [];
    const http = makeHttp(async (path: string, init?: RequestInit) => {
      calls.push(path);
      if (path === '/auth/refresh') {
        access = 'fresh';
        return { accessToken: 'fresh', refreshToken: 'refresh-2' } as unknown;
      }
      const headers = (init?.headers ?? {}) as Record<string, string>;
      if (headers.Authorization === 'Bearer stale') {
        throw new ApiError(401, 'UNAUTHORIZED', 'expired');
      }
      return { ok: true } as unknown;
    });
    const setTokens = vi.fn<(p: TokenPair) => void>();
    const client = createAuthedClient({
      http,
      getAccessToken: () => access,
      getRefreshToken: () => 'refresh-1',
      setTokens,
      onAuthCleared: () => {},
    });
    await expect(client.authed('/me')).resolves.toEqual({ ok: true });
    expect(calls).toEqual(['/me', '/auth/refresh', '/me']);
    expect(setTokens).toHaveBeenCalledWith({ accessToken: 'fresh', refreshToken: 'refresh-2' });
  });

  it('clears auth and returns false when refresh fails', async () => {
    const http = makeHttp(async (path: string) => {
      if (path === '/auth/refresh') throw new ApiError(401, 'UNAUTHORIZED', 'dead');
      return {} as unknown;
    });
    const onAuthCleared = vi.fn();
    const client = createAuthedClient({
      http,
      getAccessToken: () => 'x',
      getRefreshToken: () => 'refresh-dead',
      setTokens: () => {},
      onAuthCleared,
    });
    await expect(client.tryRefresh()).resolves.toBe(false);
    expect(onAuthCleared).toHaveBeenCalledTimes(1);
  });

  it('tryRefresh returns false immediately when there is no refresh token', async () => {
    const http = makeHttp(async () => ({}) as unknown);
    const client = createAuthedClient({
      http,
      getAccessToken: () => null,
      getRefreshToken: () => null,
      setTokens: () => {},
      onAuthCleared: () => {},
    });
    await expect(client.tryRefresh()).resolves.toBe(false);
    expect(http.apiFetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @finby/core test`
Expected: FAIL — `Cannot find module './authed'`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/authed.ts` (the `authed`/`authedStream`/`tryRefresh` mechanics ported verbatim from `apps/web/src/lib/store.ts`, with token state read/written through injected callbacks instead of Zustand's `get`/`set`):

```ts
import { ApiError, type HttpClient } from './http';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthedClientConfig {
  http: HttpClient;
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  setTokens: (pair: TokenPair) => void;
  onAuthCleared: () => void;
  /** Defaults to '/auth/refresh'. */
  refreshPath?: string;
}

export interface AuthedClient {
  authed<T>(path: string, init?: RequestInit): Promise<T>;
  authedStream(path: string, init?: RequestInit): Promise<Response>;
  tryRefresh(): Promise<boolean>;
}

export function createAuthedClient(config: AuthedClientConfig): AuthedClient {
  const { http, getAccessToken, getRefreshToken, setTokens, onAuthCleared } = config;
  const refreshPath = config.refreshPath ?? '/auth/refresh';

  async function tryRefresh(): Promise<boolean> {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;
    try {
      const pair = await http.apiFetch<TokenPair>(refreshPath, {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
      setTokens({ accessToken: pair.accessToken, refreshToken: pair.refreshToken });
      return true;
    } catch {
      // Refresh token is dead — drop straight to a clean signed-out state.
      onAuthCleared();
      return false;
    }
  }

  async function authed<T>(path: string, init: RequestInit = {}): Promise<T> {
    const withToken = (token: string | null): RequestInit => ({
      ...init,
      headers: {
        ...(init.headers ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    try {
      return await http.apiFetch<T>(path, withToken(getAccessToken()));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401 && getRefreshToken()) {
        const refreshed = await tryRefresh();
        if (refreshed) {
          return await http.apiFetch<T>(path, withToken(getAccessToken()));
        }
      }
      throw err;
    }
  }

  async function authedStream(path: string, init: RequestInit = {}): Promise<Response> {
    const run = async (token: string | null): Promise<Response> =>
      fetch(`${http.baseUrl}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

    let res: Response;
    try {
      res = await run(getAccessToken());
    } catch {
      throw new ApiError(0, 'NETWORK', "We couldn't reach Finby. Please check your connection and try again.");
    }

    if (res.status === 401 && getRefreshToken()) {
      const refreshed = await tryRefresh();
      if (refreshed) res = await run(getAccessToken());
    }

    if (!res.ok) {
      const text = await res.text();
      const body = (text ? JSON.parse(text) : {}) as { error?: string; message?: string; details?: unknown };
      throw new ApiError(
        res.status,
        body.error ?? 'ERROR',
        body.message ?? 'Something went wrong. Please try again.',
        body.details,
      );
    }
    return res;
  }

  return { authed, authedStream, tryRefresh };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @finby/core test`
Expected: PASS — all `authed` tests green.

- [ ] **Step 5: Export from the package entry point**

Add to `packages/core/src/index.ts`:

```ts
export { createAuthedClient } from './authed';
export type { AuthedClient, AuthedClientConfig, TokenPair } from './authed';
```

- [ ] **Step 6: Rewire the web store to delegate transport mechanics to core**

In `apps/web/src/lib/store.ts`:

(a) Add the core import near the top (below the existing imports):

```ts
import { createAuthedClient } from '@finby/core';
```

(b) Inside the `create<AuthState>()(persist((set, get) => ({ ... })))` factory, immediately before the returned object literal, construct the core client:

```ts
const authedClient = createAuthedClient({
  http: { baseUrl: API_BASE, apiFetch },
  getAccessToken: () => get().accessToken,
  getRefreshToken: () => get().refreshToken,
  setTokens: (pair) => set({ accessToken: pair.accessToken, refreshToken: pair.refreshToken }),
  onAuthCleared: () => set({ ...CLEARED }),
});
```

(c) Replace the three action bodies so they delegate to `authedClient`, preserving the existing `AuthState` signatures:

```ts
tryRefresh: () => authedClient.tryRefresh(),
```

```ts
authed: <T>(path: string, init?: RequestInit): Promise<T> => authedClient.authed<T>(path, init),
```

```ts
authedStream: (path, init) => authedClient.authedStream(path, init),
```

Delete the now-unused inline implementations of `tryRefresh`, `authed`, and `authedStream` (the bodies previously at lines ~125-144, ~222-246, and ~248-282). Leave `register`, `login`, `logout`, `refreshUser`, and all workspace/user actions exactly as they are — they continue to call `apiFetch` / `get().authed` directly.

(d) Fix the now-unused imports created by deleting the inline bodies, or `pnpm lint`/typecheck will fail:
- `ApiError` is no longer referenced in `store.ts` (the 401 branch now lives in core). Change `import { API_BASE, ApiError, apiFetch } from './api-client';` to `import { API_BASE, apiFetch } from './api-client';`. Keep `API_BASE` and `apiFetch` — both are still used (by the `authedClient` config and the direct-call actions `register`/`login`/`logout`/`tryRefresh` via `refreshUser`).
- `TokenPair` from `./types` is no longer referenced (only the deleted inline `tryRefresh` used it). Remove `TokenPair` from `import type { ApiUser, ApiWorkspace, AuthResult, RegisterInput, TokenPair, WorkspaceMembershipSummary } from './types';`, leaving `import type { ApiUser, ApiWorkspace, AuthResult, RegisterInput, WorkspaceMembershipSummary } from './types';`. The other five names remain in use.

- [ ] **Step 7: Rebuild core and verify web stays green**

Run: `pnpm --filter @finby/core build && pnpm --filter finby-web typecheck && pnpm --filter finby-web test`
Expected: all PASS — in particular `apps/web/src/lib/store.test.ts` stays green (the store's public behavior is unchanged).

- [ ] **Step 8: Run the full monorepo build and lint as a final gate**

Run: `pnpm build && pnpm lint`
Expected: Turbo builds `@finby/shared` → `@finby/core` → apps in order; lint passes.

- [ ] **Step 9: Commit**

```bash
git add packages/core apps/web/src/lib/store.ts
git commit -m "refactor(core): extract authed/refresh client into @finby/core"
```

---

## Phase 1 Done — What Exists After This Plan

- `@finby/core` houses the platform-agnostic kernel: `createHttpClient`, `createAuthedClient`, `parseSseFrames`, and the display formatters — all unit-tested in core.
- `apps/web` consumes the kernel with zero behavior change; the env base URL and Zustand/localStorage token state remain web-only and are injected.
- The web app is green (typecheck, tests, lint, full build).

## Follow-Up Plans (not in scope here)

- **Phase 1b — API-module + domain-type migration:** move `apps/web/src/lib/types.ts` domain types into core (or `@finby/shared`) and convert the 15 `*-api.ts` modules to transport-injected factories (`createDashboardApi(authed)` pattern) re-exported by web with the same named-export surface. This is the bulk-mechanical follow-on that makes the API layer mobile-ready.
- **Phase 2 — Expo app scaffold** (expo-router, NativeWind, EAS, design tokens, native primitives + adapters: SecureStore token storage, RN SSE transport, posthog-react-native).
- **Phase 3** auth + secure storage + biometric · **Phase 4** chat + SSE transport · **Phase 5** dashboard/transactions/streaks/settings/billing · **Phase 6** native push + haptics + polish · **Phase 7** EAS build → internal testing → store submission.

Each follow-up phase gets its own plan via the writing-plans skill when it is reached.
