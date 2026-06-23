# Mobile Phase 2 — Expo App Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the `apps/mobile` Expo app and wire the `@finby/core` kernel + API factories into a mobile data layer through platform adapters (SecureStore token storage, an `expo/fetch` streaming transport, posthog-react-native), proving the shared-core architecture end-to-end — with all logic unit-tested here and device/EAS steps documented.

**Architecture:** A new Expo (managed, expo-router, NativeWind) app in `apps/mobile`. It reuses `@finby/core`'s `createHttpClient`/`createAuthedClient` and all `createXxxApi` factories. Platform-specific behavior is isolated behind small dependency-injected adapters whose *logic* is decoupled from native-module imports so it runs under Vitest on this Linux box; the thin files that actually import `expo-secure-store` / `posthog-react-native` / `expo/fetch` are not unit-tested here (verified on device). A mobile session/auth module binds those adapters into the core client and exposes a fully-bound `api` object.

**Tech Stack:** Expo (managed workflow, latest stable SDK), React Native, React 19, expo-router, NativeWind v4, Zustand, `@finby/core`, `@finby/shared`, Vitest. EAS Build/Submit for cloud builds (documented, run on the user's machine).

## Global Constraints

- Node `>=20`; pnpm `10.28.1`. Use `npx expo install <pkg>` for any Expo/native dependency so SDK-compatible versions are pinned automatically (do NOT hand-pin native dep versions).
- Commit messages: NO AI-attribution trailers, NO "Generated with" boilerplate. One logical change per commit (atomic).
- TypeScript strict + `noUncheckedIndexedAccess` (inherited from `tsconfig.base.json`).
- `@finby/core` must remain platform-agnostic (ESLint guard on `packages/core/src/**`): the only core change in this plan is an optional injected `fetchImpl` on `createAuthedClient`, defaulting to the global `fetch` — no platform import added.
- Adapter logic that we unit-test here MUST NOT import `react-native`, `expo-*`, `expo/fetch`, or `posthog-react-native` at module top level. Those imports live only in thin "native binding" files consumed by the app entry, never by `*.test.ts`.
- This is a Linux dev box: do NOT attempt to launch a simulator, run `expo start` interactively, or run `eas build` in this session. Verification here = `pnpm --filter finby-mobile typecheck` + `pnpm --filter finby-mobile test` (Vitest). Running the app and EAS are documented for the user.
- Design tokens (colors) must mirror `apps/web/tailwind.config.ts` exactly: canvas `#06101f`, surface `#0b1626`, surface-2 `#11203a`, line `#1c2c46`, accent `#1d6ef5` (hover `#3b82f6`, soft `rgba(29,110,245,0.14)`), ink `#e8eef7`, muted `#8da3c0`, faint `#5b6f8c`, success `#1fae6a`, warn `#f5a524`, danger `#ef4444`.
- Web must stay green after the core change (Task 4): `pnpm --filter finby-web typecheck` and `pnpm --filter finby-web test` pass.

## File Structure (created by this plan)

```
packages/core/src/authed.ts            # MODIFIED: optional injected fetchImpl
apps/mobile/
  package.json                         # finby-mobile
  app.json                             # Expo config (name, slug, bundle ids, scheme)
  tsconfig.json                        # extends expo base + repo base
  babel.config.js                      # babel-preset-expo + nativewind
  metro.config.js                      # pnpm-monorepo-aware + nativewind
  vitest.config.ts                     # node env for *.test.ts logic
  global.css                           # tailwind directives (nativewind)
  tailwind.config.ts                   # mirrors web tokens (imports tokens.ts)
  nativewind-env.d.ts                  # nativewind types
  eas.json                             # EAS build profiles (documented use)
  app/
    _layout.tsx                        # expo-router root layout
    index.tsx                          # placeholder boot screen
  src/
    theme/tokens.ts                    # color palette (JS source of truth)
    config.ts                          # resolveApiBase() from env
    adapters/
      token-store.ts                   # createTokenStore(secureStore) — TESTED
      secure-store.native.ts           # expo-secure-store binding (not unit-tested)
      analytics.ts                     # createAnalytics(client) — TESTED
      posthog.native.ts                # posthog-react-native binding (not unit-tested)
      stream.native.ts                 # expo/fetch binding (not unit-tested)
    lib/
      session.ts                       # createMobileSession({tokenStore}) — TESTED
      api.ts                           # createMobileApi(deps) binds all core factories — TESTED
      runtime.native.ts                # composition root: real adapters → session + api (not unit-tested)
  README.md                            # run-on-device + EAS instructions
```

---

### Task 1: Add optional `fetchImpl` to `@finby/core` `createAuthedClient`

**Files:**
- Modify: `packages/core/src/authed.ts`
- Modify: `packages/core/src/authed.test.ts`

**Interfaces:**
- Consumes: existing `HttpClient`, `ApiError`.
- Produces: `AuthedClientConfig` gains optional `fetchImpl?: typeof fetch`. `authedStream` uses `config.fetchImpl ?? fetch`. No signature change to `authed`/`tryRefresh`. Default behavior identical (web passes nothing).

- [ ] **Step 1: Write the failing test**

Add to `packages/core/src/authed.test.ts` (new `describe` block):
```ts
describe('createAuthedClient.authedStream fetchImpl injection', () => {
  it('uses the injected fetchImpl instead of global fetch', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;
    const http = { baseUrl: 'https://api.test/v1', apiFetch: vi.fn() } as unknown as import('./http').HttpClient;
    const client = createAuthedClient({
      http,
      getAccessToken: () => 'tok',
      getRefreshToken: () => 'r',
      setTokens: () => {},
      onAuthCleared: () => {},
      fetchImpl,
    });
    const res = await client.authedStream('/stream', { method: 'POST' });
    expect(await res.text()).toBe('ok');
    expect(calls).toEqual(['https://api.test/v1/stream']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @finby/core test`
Expected: FAIL — `fetchImpl` is not yet honored (global `fetch` is called, the injected mock's `calls` stays empty / the call throws because there is no global fetch stub).

- [ ] **Step 3: Implement the injection**

In `packages/core/src/authed.ts`, add to the `AuthedClientConfig` interface:
```ts
  /** Streaming fetch implementation for authedStream. Defaults to the global
   *  `fetch`. Mobile injects `expo/fetch` so the Response body is a real
   *  ReadableStream (getReader); the web/global fetch is correct on the web. */
  fetchImpl?: typeof fetch;
```
Then, inside `createAuthedClient`, near the other destructured config, add:
```ts
  const doFetch = config.fetchImpl ?? fetch;
```
and in `authedStream`'s `run` helper, change `fetch(` to `doFetch(`:
```ts
    const run = async (token: string | null): Promise<Response> =>
      doFetch(`${http.baseUrl}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
```
Leave everything else in `authedStream` (NETWORK catch, 401→tryRefresh→re-run, non-ok ApiError) unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @finby/core test`
Expected: PASS — all authed tests green including the new injection test.

- [ ] **Step 5: Verify web stays green (default path unchanged)**

Run: `pnpm --filter @finby/core build && pnpm --filter finby-web typecheck && pnpm --filter finby-web test`
Expected: all PASS — `apps/web/src/lib/store.ts` calls `createAuthedClient` without `fetchImpl`, so it uses global `fetch` exactly as before.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/authed.ts packages/core/src/authed.test.ts
git commit -m "feat(core): allow injecting fetchImpl into authedStream (default global fetch)"
```

---

### Task 2: Scaffold the Expo app (boots to a placeholder, monorepo-aware)

**Files:**
- Create: `apps/mobile/package.json`, `apps/mobile/app.json`, `apps/mobile/tsconfig.json`, `apps/mobile/babel.config.js`, `apps/mobile/metro.config.js`, `apps/mobile/vitest.config.ts`, `apps/mobile/app/_layout.tsx`, `apps/mobile/app/index.tsx`, `apps/mobile/src/sanity.test.ts`

**Interfaces:**
- Produces: a `finby-mobile` workspace package that typechecks and whose Vitest suite runs. expo-router entry boots to a placeholder screen (verified on device, not here).

- [ ] **Step 1: Create the package manifest**

`apps/mobile/package.json` (the `expo`/native deps are installed via `expo install` in Step 7, which writes exact compatible versions; start with scripts + workspace deps):
```json
{
  "name": "finby-mobile",
  "version": "0.0.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@finby/core": "workspace:*",
    "@finby/shared": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create the Expo app config**

`apps/mobile/app.json`:
```json
{
  "expo": {
    "name": "Finby",
    "slug": "finby",
    "scheme": "finby",
    "version": "0.0.1",
    "orientation": "portrait",
    "userInterfaceStyle": "dark",
    "newArchEnabled": true,
    "ios": { "bundleIdentifier": "app.finby.mobile", "supportsTablet": true },
    "android": { "package": "app.finby.mobile" },
    "plugins": ["expo-router", "expo-secure-store"],
    "experiments": { "typedRoutes": true },
    "extra": { "apiBase": "http://localhost:3001/api/v1" }
  }
}
```

- [ ] **Step 3: Create the TypeScript config**

`apps/mobile/tsconfig.json`:
```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts", "nativewind-env.d.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create the Babel config**

`apps/mobile/babel.config.js`:
```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};
```

- [ ] **Step 5: Create the monorepo-aware Metro config**

`apps/mobile/metro.config.js` (pnpm workspace: watch the repo root, resolve hoisted + package-local node_modules, and enable NativeWind):
```js
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = withNativeWind(config, { input: './global.css' });
```

- [ ] **Step 6: Create the router entry + placeholder screen**

`apps/mobile/app/_layout.tsx`:
```tsx
import '../global.css';
import { Stack } from 'expo-router';

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```
`apps/mobile/app/index.tsx`:
```tsx
import { Text, View } from 'react-native';

export default function Index() {
  return (
    <View className="flex-1 items-center justify-center bg-canvas">
      <Text className="text-ink text-2xl font-semibold">Finby</Text>
    </View>
  );
}
```

- [ ] **Step 7: Install Expo + native deps with version pinning**

Run (from repo root; `expo install` resolves SDK-compatible versions and writes them into `apps/mobile/package.json`):
```bash
pnpm --filter finby-mobile exec expo install expo expo-router expo-secure-store expo-constants react react-native react-native-safe-area-context react-native-screens
pnpm --filter finby-mobile exec expo install nativewind tailwindcss --dev
pnpm install
```
Expected: deps added to `apps/mobile/package.json`; `pnpm install` completes. (If `expo` is not yet resolvable to run `expo install`, first `pnpm --filter finby-mobile add expo` then re-run.)

- [ ] **Step 8: Create the Vitest config + a sanity test**

`apps/mobile/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```
`apps/mobile/src/sanity.test.ts`:
```ts
import { describe, expect, it } from 'vitest';

describe('finby-mobile', () => {
  it('runs the test suite', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 9: Verify typecheck + tests**

Run: `pnpm --filter @finby/core build && pnpm --filter @finby/shared build && pnpm --filter finby-mobile typecheck && pnpm --filter finby-mobile test`
Expected: typecheck exits 0; Vitest shows `1 passed`. (Do NOT run `expo start` here — that is a device step in Task 8.)

- [ ] **Step 10: Commit**

```bash
git add apps/mobile pnpm-lock.yaml
git commit -m "feat(mobile): scaffold Expo app (expo-router, monorepo metro, boots placeholder)"
```

---

### Task 3: Design tokens + NativeWind theme

**Files:**
- Create: `apps/mobile/src/theme/tokens.ts`, `apps/mobile/src/theme/tokens.test.ts`, `apps/mobile/tailwind.config.js`, `apps/mobile/global.css`, `apps/mobile/nativewind-env.d.ts`

**Interfaces:**
- Produces: `export const COLORS` (the palette, JS source of truth) consumed by both `tailwind.config.js` and any JS that needs raw color values.

- [ ] **Step 1: Write the failing test**

`apps/mobile/src/theme/tokens.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { COLORS } from './tokens';

describe('COLORS', () => {
  it('mirrors the web palette exactly', () => {
    expect(COLORS.canvas).toBe('#06101f');
    expect(COLORS.accent.DEFAULT).toBe('#1d6ef5');
    expect(COLORS.ink).toBe('#e8eef7');
    expect(COLORS.danger).toBe('#ef4444');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-mobile test`
Expected: FAIL — `Cannot find module './tokens'`.

- [ ] **Step 3: Create the tokens module**

`apps/mobile/src/theme/tokens.ts`:
```ts
/** Color palette — mirrors apps/web/tailwind.config.ts so web and mobile share
 *  one visual language. JS source of truth; tailwind.config.js consumes this. */
export const COLORS = {
  canvas: '#06101f',
  surface: '#0b1626',
  'surface-2': '#11203a',
  line: '#1c2c46',
  accent: { DEFAULT: '#1d6ef5', hover: '#3b82f6', soft: 'rgba(29,110,245,0.14)' },
  ink: '#e8eef7',
  muted: '#8da3c0',
  faint: '#5b6f8c',
  success: '#1fae6a',
  warn: '#f5a524',
  danger: '#ef4444',
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-mobile test`
Expected: PASS.

- [ ] **Step 5: Create the NativeWind theme + CSS files**

`apps/mobile/tailwind.config.ts` (Tailwind 3.4 loads a `.ts` config via jiti, so it can import the TS tokens module — single source of truth, no duplicated hex):
```ts
import type { Config } from 'tailwindcss';
import { COLORS } from './src/theme/tokens';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nativewindPreset = require('nativewind/preset');

export default {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [nativewindPreset],
  theme: { extend: { colors: COLORS } },
  plugins: [],
} satisfies Config;
```
> If the NativeWind/Metro toolchain cannot load a `.ts` Tailwind config in your environment, rename to `tailwind.config.js` and inline the palette literally (the exact hex values are in the Global Constraints), keeping `tokens.ts` as the source the app JS imports. Confirm with a successful Metro start on device.

`apps/mobile/global.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```
`apps/mobile/nativewind-env.d.ts`:
```ts
/// <reference types="nativewind/types" />
```

- [ ] **Step 6: Verify typecheck + tests**

Run: `pnpm --filter finby-mobile typecheck && pnpm --filter finby-mobile test`
Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/theme apps/mobile/tailwind.config.js apps/mobile/global.css apps/mobile/nativewind-env.d.ts
git commit -m "feat(mobile): design tokens + NativeWind theme mirroring web palette"
```

---

### Task 4: API base config resolution

**Files:**
- Create: `apps/mobile/src/config.ts`, `apps/mobile/src/config.test.ts`

**Interfaces:**
- Produces: `function resolveApiBase(sources: { envUrl?: string; extraApiBase?: unknown }): string` — returns `envUrl` if set, else `extraApiBase` if a non-empty string, else the localhost default `http://localhost:3001/api/v1`. (The native binding that reads `process.env.EXPO_PUBLIC_API_URL` + `expo-constants` is wired in Task 7; this function is the pure, testable resolver.)

- [ ] **Step 1: Write the failing test**

`apps/mobile/src/config.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { resolveApiBase } from './config';

describe('resolveApiBase', () => {
  it('prefers the env URL', () => {
    expect(resolveApiBase({ envUrl: 'https://api.finby.app/api/v1', extraApiBase: 'x' }))
      .toBe('https://api.finby.app/api/v1');
  });
  it('falls back to app.json extra.apiBase', () => {
    expect(resolveApiBase({ extraApiBase: 'https://staging.finby.app/api/v1' }))
      .toBe('https://staging.finby.app/api/v1');
  });
  it('defaults to localhost when nothing is configured', () => {
    expect(resolveApiBase({})).toBe('http://localhost:3001/api/v1');
    expect(resolveApiBase({ extraApiBase: '' })).toBe('http://localhost:3001/api/v1');
    expect(resolveApiBase({ extraApiBase: 42 })).toBe('http://localhost:3001/api/v1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-mobile test`
Expected: FAIL — `Cannot find module './config'`.

- [ ] **Step 3: Implement the resolver**

`apps/mobile/src/config.ts`:
```ts
export const DEFAULT_API_BASE = 'http://localhost:3001/api/v1';

/** Resolve the API base URL from injected sources (pure + testable). Order:
 *  EXPO_PUBLIC_API_URL env → app.json `extra.apiBase` → localhost default. */
export function resolveApiBase(sources: { envUrl?: string; extraApiBase?: unknown }): string {
  if (sources.envUrl) return sources.envUrl;
  if (typeof sources.extraApiBase === 'string' && sources.extraApiBase.length > 0) {
    return sources.extraApiBase;
  }
  return DEFAULT_API_BASE;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-mobile test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/config.ts apps/mobile/src/config.test.ts
git commit -m "feat(mobile): API base URL resolver"
```

---

### Task 5: SecureStore-backed token store adapter

**Files:**
- Create: `apps/mobile/src/adapters/token-store.ts`, `apps/mobile/src/adapters/token-store.test.ts`, `apps/mobile/src/adapters/secure-store.native.ts`

**Interfaces:**
- Consumes: `TokenPair` from `@finby/core`.
- Produces:
  - `interface SecureStoreLike { getItemAsync(key: string): Promise<string | null>; setItemAsync(key: string, value: string): Promise<void>; deleteItemAsync(key: string): Promise<void> }`
  - `interface TokenStore { load(): Promise<TokenPair | null>; save(pair: TokenPair): Promise<void>; clear(): Promise<void> }`
  - `function createTokenStore(secureStore: SecureStoreLike): TokenStore` (key `finby.tokens`, JSON-encoded). Tolerates malformed stored JSON (returns null).
  - `secure-store.native.ts` exports `secureStore: SecureStoreLike` backed by `expo-secure-store` (thin; not unit-tested here).

- [ ] **Step 1: Write the failing test**

`apps/mobile/src/adapters/token-store.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createTokenStore, type SecureStoreLike } from './token-store';

function fakeSecureStore(): SecureStoreLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    async getItemAsync(k) { return map.get(k) ?? null; },
    async setItemAsync(k, v) { map.set(k, v); },
    async deleteItemAsync(k) { map.delete(k); },
  };
}

describe('createTokenStore', () => {
  it('save then load round-trips the token pair', async () => {
    const ss = fakeSecureStore();
    const store = createTokenStore(ss);
    await store.save({ accessToken: 'a', refreshToken: 'r' });
    expect(ss.map.get('finby.tokens')).toBe(JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    await expect(store.load()).resolves.toEqual({ accessToken: 'a', refreshToken: 'r' });
  });
  it('load returns null when nothing is stored', async () => {
    await expect(createTokenStore(fakeSecureStore()).load()).resolves.toBeNull();
  });
  it('load returns null on malformed JSON', async () => {
    const ss = fakeSecureStore();
    ss.map.set('finby.tokens', 'not json');
    await expect(createTokenStore(ss).load()).resolves.toBeNull();
  });
  it('clear removes the stored pair', async () => {
    const ss = fakeSecureStore();
    const store = createTokenStore(ss);
    await store.save({ accessToken: 'a', refreshToken: 'r' });
    await store.clear();
    await expect(store.load()).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-mobile test`
Expected: FAIL — `Cannot find module './token-store'`.

- [ ] **Step 3: Implement the token store**

`apps/mobile/src/adapters/token-store.ts`:
```ts
import type { TokenPair } from '@finby/core';

const TOKENS_KEY = 'finby.tokens';

export interface SecureStoreLike {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export interface TokenStore {
  load(): Promise<TokenPair | null>;
  save(pair: TokenPair): Promise<void>;
  clear(): Promise<void>;
}

/** Persist the bearer token pair in the platform secure store (Keychain/Keystore).
 *  Logic is decoupled from expo-secure-store via the injected SecureStoreLike. */
export function createTokenStore(secureStore: SecureStoreLike): TokenStore {
  return {
    async load() {
      const raw = await secureStore.getItemAsync(TOKENS_KEY);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as Partial<TokenPair>;
        if (typeof parsed.accessToken === 'string' && typeof parsed.refreshToken === 'string') {
          return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken };
        }
        return null;
      } catch {
        return null;
      }
    },
    async save(pair) {
      await secureStore.setItemAsync(TOKENS_KEY, JSON.stringify(pair));
    },
    async clear() {
      await secureStore.deleteItemAsync(TOKENS_KEY);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-mobile test`
Expected: PASS — all token-store tests green.

- [ ] **Step 5: Create the native binding (not unit-tested here)**

`apps/mobile/src/adapters/secure-store.native.ts`:
```ts
import * as SecureStore from 'expo-secure-store';
import type { SecureStoreLike } from './token-store';

/** expo-secure-store binding. Verified on device (no Vitest coverage — pure
 *  pass-through to the native module). */
export const secureStore: SecureStoreLike = {
  getItemAsync: (k) => SecureStore.getItemAsync(k),
  setItemAsync: (k, v) => SecureStore.setItemAsync(k, v),
  deleteItemAsync: (k) => SecureStore.deleteItemAsync(k),
};
```

- [ ] **Step 6: Verify typecheck + tests**

Run: `pnpm --filter finby-mobile typecheck && pnpm --filter finby-mobile test`
Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/adapters/token-store.ts apps/mobile/src/adapters/token-store.test.ts apps/mobile/src/adapters/secure-store.native.ts
git commit -m "feat(mobile): SecureStore-backed token store adapter"
```

---

### Task 6: Analytics adapter (posthog-react-native)

**Files:**
- Create: `apps/mobile/src/adapters/analytics.ts`, `apps/mobile/src/adapters/analytics.test.ts`, `apps/mobile/src/adapters/posthog.native.ts`

**Interfaces:**
- Consumes: `SubscriptionTier` from `@finby/shared`.
- Produces:
  - `type AnalyticsEvent` (same union as `apps/web/src/lib/analytics.ts`).
  - `interface PostHogLike { capture(event: string, props?: Record<string, unknown>): void; identify(id: string, props?: Record<string, unknown>): void; reset(): void }`
  - `function sanitizeProps(props, denyKeys): Record<string, unknown>` (drops deny-listed keys).
  - `function createAnalytics(client: PostHogLike | null, denyKeys: string[]): { identifyUser; resetAnalytics; track }` — no-ops when `client` is null (no key configured). `track` is total (never throws).
  - `posthog.native.ts` builds a `PostHogLike` from `posthog-react-native` when `EXPO_PUBLIC_POSTHOG_KEY` is set (thin; not unit-tested here).

- [ ] **Step 1: Write the failing test**

`apps/mobile/src/adapters/analytics.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { createAnalytics, sanitizeProps } from './analytics';

const DENY = ['amount', 'balance', 'email'];

describe('sanitizeProps', () => {
  it('drops deny-listed keys (case-insensitive)', () => {
    expect(sanitizeProps({ tier: 'PRO', Amount: 5, email: 'x@y.z' }, DENY)).toEqual({ tier: 'PRO' });
  });
  it('returns {} for undefined', () => {
    expect(sanitizeProps(undefined, DENY)).toEqual({});
  });
});

describe('createAnalytics', () => {
  it('no-ops safely when client is null', () => {
    const a = createAnalytics(null, DENY);
    expect(() => { a.track('signed_up'); a.identifyUser('u1', 'PRO'); a.resetAnalytics(); }).not.toThrow();
  });
  it('forwards sanitized props to capture', () => {
    const client = { capture: vi.fn(), identify: vi.fn(), reset: vi.fn() };
    createAnalytics(client, DENY).track('transaction_logged', { tier: 'PRO', amount: 9 });
    expect(client.capture).toHaveBeenCalledWith('transaction_logged', { tier: 'PRO' });
  });
  it('identify forwards the tier; never throws if the client throws', () => {
    const client = { capture: () => {}, identify: vi.fn(() => { throw new Error('boom'); }), reset: () => {} };
    expect(() => createAnalytics(client, DENY).identifyUser('u1', 'PRO')).not.toThrow();
    expect(client.identify).toHaveBeenCalledWith('u1', { tier: 'PRO' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-mobile test`
Expected: FAIL — `Cannot find module './analytics'`.

- [ ] **Step 3: Implement the analytics adapter**

`apps/mobile/src/adapters/analytics.ts`:
```ts
import type { SubscriptionTier } from '@finby/shared';

/** Allow-listed event names — mirrors apps/web/src/lib/analytics.ts. */
export type AnalyticsEvent =
  | 'onboarding_started'
  | 'onboarding_completed'
  | 'onboarding_skipped'
  | 'signed_up'
  | 'chat_message_sent'
  | 'chat_cleared'
  | 'transaction_logged'
  | 'budget_set'
  | 'upgrade_modal_viewed'
  | 'checkout_started'
  | 'subscription_activated'
  | 'feedback_submitted';

export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

export interface PostHogLike {
  capture(event: string, props?: Record<string, unknown>): void;
  identify(id: string, props?: Record<string, unknown>): void;
  reset(): void;
}

/** Drop any property whose key matches the financial/PII deny-list. Total. */
export function sanitizeProps(props: AnalyticsProps | undefined, denyKeys: string[]): AnalyticsProps {
  if (!props) return {};
  const out: AnalyticsProps = {};
  for (const [k, v] of Object.entries(props)) {
    if (denyKeys.includes(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

export interface Analytics {
  identifyUser(userId: string, tier: SubscriptionTier): void;
  resetAnalytics(): void;
  track(event: AnalyticsEvent, props?: AnalyticsProps): void;
}

/** Build the analytics surface from an injected PostHog client. When `client`
 *  is null (no key configured) every method is a safe no-op. All methods are
 *  total — analytics must never break the app. */
export function createAnalytics(client: PostHogLike | null, denyKeys: string[]): Analytics {
  return {
    identifyUser(userId, tier) {
      if (!client) return;
      try { client.identify(userId, { tier }); } catch { /* ignore */ }
    },
    resetAnalytics() {
      if (!client) return;
      try { client.reset(); } catch { /* ignore */ }
    },
    track(event, props) {
      if (!client) return;
      try { client.capture(event, sanitizeProps(props, denyKeys)); } catch { /* ignore */ }
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-mobile test`
Expected: PASS.

- [ ] **Step 5: Create the native binding (not unit-tested here)**

`apps/mobile/src/adapters/posthog.native.ts`:
```ts
import PostHog from 'posthog-react-native';
import type { PostHogLike } from './analytics';

/** posthog-react-native binding. Returns null when no key is configured, so
 *  createAnalytics no-ops. Verified on device. */
export function makePostHog(): PostHogLike | null {
  const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  const client = new PostHog(key, {
    host: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
  });
  return {
    capture: (event, props) => client.capture(event, props),
    identify: (id, props) => client.identify(id, props),
    reset: () => client.reset(),
  };
}
```
Install the dep: `pnpm --filter finby-mobile exec expo install posthog-react-native`, then `pnpm install`.

- [ ] **Step 6: Verify typecheck + tests**

Run: `pnpm --filter finby-mobile typecheck && pnpm --filter finby-mobile test`
Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/adapters/analytics.ts apps/mobile/src/adapters/analytics.test.ts apps/mobile/src/adapters/posthog.native.ts apps/mobile/package.json pnpm-lock.yaml
git commit -m "feat(mobile): analytics adapter over posthog-react-native"
```

---

### Task 7: Mobile session + bound `api` (the architecture proof)

**Files:**
- Create: `apps/mobile/src/lib/session.ts`, `apps/mobile/src/lib/session.test.ts`, `apps/mobile/src/lib/api.ts`, `apps/mobile/src/lib/api.test.ts`, `apps/mobile/src/adapters/stream.native.ts`

**Interfaces:**
- Consumes: `@finby/core` (`createHttpClient`, `createAuthedClient`, `AuthedFetch`, `AuthedStream`, `TokenPair`, all `createXxxApi`), `TokenStore` (Task 5), `resolveApiBase` (Task 4).
- Produces:
  - `interface MobileSession { authed: AuthedFetch; authedStream: AuthedStream; tryRefresh(): Promise<boolean>; setSession(pair: TokenPair): Promise<void>; clearSession(): Promise<void>; hydrate(): Promise<boolean>; getAccessToken(): string | null }`
  - `function createMobileSession(deps: { apiBase: string; tokenStore: TokenStore; fetchImpl?: typeof fetch }): MobileSession` — holds tokens in memory (sync getters for the core client), persists to `tokenStore` on change, `hydrate()` loads persisted tokens at startup. Builds the core http + authed client (passing `fetchImpl` through to `authedStream`).
  - `function createMobileApi(session: MobileSession, apiBase: string)` — returns `{ dashboard, transactions, accounts, streaks, alerts, settings, support, feedback, members, auth, billing, receipts, gamification, chat }`, each from the matching `@finby/core` factory bound to `session.authed` / `session.authedStream` (+ `apiBase` for gamification, + a public `apiFetch` for members/auth/billing built from the core http client).
  - `stream.native.ts` exports `expoFetch: typeof fetch` from `expo/fetch` (thin; not unit-tested here).

- [ ] **Step 1: Write the failing session test**

`apps/mobile/src/lib/session.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { createMobileSession } from './session';
import { createTokenStore, type SecureStoreLike } from '../adapters/token-store';

function fakeSecureStore(): SecureStoreLike {
  const map = new Map<string, string>();
  return {
    async getItemAsync(k) { return map.get(k) ?? null; },
    async setItemAsync(k, v) { map.set(k, v); },
    async deleteItemAsync(k) { map.delete(k); },
  };
}

describe('createMobileSession', () => {
  it('setSession persists to the token store and exposes the access token', async () => {
    const tokenStore = createTokenStore(fakeSecureStore());
    const session = createMobileSession({ apiBase: 'https://api.test/v1', tokenStore });
    await session.setSession({ accessToken: 'a1', refreshToken: 'r1' });
    expect(session.getAccessToken()).toBe('a1');
    await expect(tokenStore.load()).resolves.toEqual({ accessToken: 'a1', refreshToken: 'r1' });
  });

  it('hydrate loads persisted tokens into memory', async () => {
    const tokenStore = createTokenStore(fakeSecureStore());
    await tokenStore.save({ accessToken: 'a2', refreshToken: 'r2' });
    const session = createMobileSession({ apiBase: 'https://api.test/v1', tokenStore });
    expect(session.getAccessToken()).toBeNull();
    await expect(session.hydrate()).resolves.toBe(true);
    expect(session.getAccessToken()).toBe('a2');
  });

  it('clearSession wipes memory and storage', async () => {
    const tokenStore = createTokenStore(fakeSecureStore());
    const session = createMobileSession({ apiBase: 'https://api.test/v1', tokenStore });
    await session.setSession({ accessToken: 'a', refreshToken: 'r' });
    await session.clearSession();
    expect(session.getAccessToken()).toBeNull();
    await expect(tokenStore.load()).resolves.toBeNull();
  });

  it('authed attaches the bearer token (the non-stream path uses the core http client / global fetch)', async () => {
    const tokenStore = createTokenStore(fakeSecureStore());
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
    const session = createMobileSession({ apiBase: 'https://api.test/v1', tokenStore });
    await session.setSession({ accessToken: 'a1', refreshToken: 'r1' });
    await expect(session.authed<{ ok: boolean }>('/me')).resolves.toEqual({ ok: true });
    expect(calls[0]?.url).toBe('https://api.test/v1/me');
    expect((calls[0]?.init?.headers as Record<string, string>).Authorization).toBe('Bearer a1');
    vi.unstubAllGlobals();
  });

  it('authedStream uses the injected fetchImpl (expo/fetch on device — the streaming path)', async () => {
    const tokenStore = createTokenStore(fakeSecureStore());
    const fetchImpl = vi.fn(async () => new Response('hi', { status: 200 })) as unknown as typeof fetch;
    const session = createMobileSession({ apiBase: 'https://api.test/v1', tokenStore, fetchImpl });
    await session.setSession({ accessToken: 'a1', refreshToken: 'r1' });
    const res = await session.authedStream('/stream', { method: 'POST' });
    expect(await res.text()).toBe('hi');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-mobile test`
Expected: FAIL — `Cannot find module './session'`.

- [ ] **Step 3: Implement the session**

`apps/mobile/src/lib/session.ts`:
```ts
import { createAuthedClient, createHttpClient, type AuthedFetch, type AuthedStream, type TokenPair } from '@finby/core';
import type { TokenStore } from '../adapters/token-store';

export interface MobileSession {
  authed: AuthedFetch;
  authedStream: AuthedStream;
  tryRefresh(): Promise<boolean>;
  setSession(pair: TokenPair): Promise<void>;
  clearSession(): Promise<void>;
  hydrate(): Promise<boolean>;
  getAccessToken(): string | null;
}

/** The mobile auth/transport container. Tokens live in memory (synchronous
 *  getters the core client needs) and are mirrored to the secure token store.
 *  Reuses @finby/core's http + authed client so refresh/streaming logic is
 *  single-sourced; only storage + the streaming fetch differ from web. */
export function createMobileSession(deps: {
  apiBase: string;
  tokenStore: TokenStore;
  fetchImpl?: typeof fetch;
}): MobileSession {
  let accessToken: string | null = null;
  let refreshToken: string | null = null;

  const http = createHttpClient({ baseUrl: deps.apiBase });

  const client = createAuthedClient({
    http,
    getAccessToken: () => accessToken,
    getRefreshToken: () => refreshToken,
    setTokens: (pair) => {
      accessToken = pair.accessToken;
      refreshToken = pair.refreshToken;
      // Fire-and-forget persistence; in-memory state is the source of truth for reads.
      void deps.tokenStore.save(pair);
    },
    onAuthCleared: () => {
      accessToken = null;
      refreshToken = null;
      void deps.tokenStore.clear();
    },
    fetchImpl: deps.fetchImpl,
  });

  return {
    authed: client.authed,
    authedStream: client.authedStream,
    tryRefresh: client.tryRefresh,
    getAccessToken: () => accessToken,
    async setSession(pair) {
      accessToken = pair.accessToken;
      refreshToken = pair.refreshToken;
      await deps.tokenStore.save(pair);
    },
    async clearSession() {
      accessToken = null;
      refreshToken = null;
      await deps.tokenStore.clear();
    },
    async hydrate() {
      const stored = await deps.tokenStore.load();
      if (!stored) return false;
      accessToken = stored.accessToken;
      refreshToken = stored.refreshToken;
      return true;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-mobile test`
Expected: PASS — all session tests green.

- [ ] **Step 5: Write the failing api test**

`apps/mobile/src/lib/api.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { createMobileApi } from './api';
import type { MobileSession } from './session';

function fakeSession(): MobileSession {
  return {
    authed: vi.fn(async () => ({ conversations: [] }) as never),
    authedStream: vi.fn(async () => new Response('')),
    tryRefresh: vi.fn(async () => false),
    setSession: vi.fn(async () => {}),
    clearSession: vi.fn(async () => {}),
    hydrate: vi.fn(async () => false),
    getAccessToken: () => 'a1',
  };
}

describe('createMobileApi', () => {
  it('exposes every core API namespace', () => {
    const api = createMobileApi(fakeSession(), 'https://api.test/v1');
    for (const ns of [
      'dashboard', 'transactions', 'accounts', 'streaks', 'alerts', 'settings',
      'support', 'feedback', 'members', 'auth', 'billing', 'receipts', 'gamification', 'chat',
    ]) {
      expect(api).toHaveProperty(ns);
    }
  });

  it('routes a dashboard call through session.authed', async () => {
    const session = fakeSession();
    const api = createMobileApi(session, 'https://api.test/v1');
    await api.dashboard.listBudgets('ws1');
    expect(session.authed).toHaveBeenCalledWith('/workspaces/ws1/budgets');
  });

  it('builds gamification badge URLs from the apiBase', () => {
    const api = createMobileApi(fakeSession(), 'https://api.test/v1');
    expect(api.gamification.getBadgeSvgUrl('ws1', 'streak-7'))
      .toBe('https://api.test/v1/workspaces/ws1/gamification/achievements/streak-7/badge.svg');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter finby-mobile test`
Expected: FAIL — `Cannot find module './api'`.

- [ ] **Step 7: Implement the bound api**

`apps/mobile/src/lib/api.ts`:
```ts
import {
  createHttpClient,
  createDashboardApi, createTransactionsApi, createAccountsApi, createStreaksApi,
  createAlertsApi, createSettingsApi, createSupportApi, createFeedbackApi,
  createMembersApi, createAuthApi, createBillingApi, createReceiptsApi,
  createGamificationApi, createChatApi,
} from '@finby/core';
import type { MobileSession } from './session';

/** Bind every @finby/core API factory to the mobile session's transport.
 *  `apiFetch` (unauthenticated) is the core http client; members/auth/billing
 *  need it for their public endpoints. */
export function createMobileApi(session: MobileSession, apiBase: string) {
  const { authed, authedStream } = session;
  const { apiFetch } = createHttpClient({ baseUrl: apiBase });

  return {
    dashboard: createDashboardApi(authed),
    transactions: createTransactionsApi(authed),
    accounts: createAccountsApi(authed),
    streaks: createStreaksApi(authed),
    alerts: createAlertsApi(authed),
    settings: createSettingsApi(authed),
    support: createSupportApi(authed),
    feedback: createFeedbackApi(authed),
    members: createMembersApi({ authed, apiFetch }),
    auth: createAuthApi({ authed, apiFetch }),
    billing: createBillingApi({ authed, apiFetch }),
    receipts: createReceiptsApi(authed),
    gamification: createGamificationApi({ authed, authedStream, apiBase }),
    chat: createChatApi({ authed, authedStream }),
  };
}

export type MobileApi = ReturnType<typeof createMobileApi>;
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter finby-mobile test`
Expected: PASS — api namespaces + routing + gamification URL tests green.

- [ ] **Step 9: Create the streaming native binding (not unit-tested here)**

`apps/mobile/src/adapters/stream.native.ts`:
```ts
import { fetch as expoFetch } from 'expo/fetch';

/** expo/fetch returns a Response whose body is a real ReadableStream
 *  (getReader), which @finby/core's chat streamMessage needs. RN's global
 *  fetch buffers and lacks getReader. Verified on device. */
export const streamFetch = expoFetch as unknown as typeof fetch;
```

- [ ] **Step 10: Create the composition root (native; not unit-tested here)**

`apps/mobile/src/lib/runtime.native.ts` — wires the real adapters into a singleton session + api for screens to import. Imports native bindings + `expo-constants`, so it is device-verified, not Vitest-covered. This is where `resolveApiBase` (Task 4) is consumed:
```ts
import Constants from 'expo-constants';
import { resolveApiBase } from '../config';
import { createTokenStore } from '../adapters/token-store';
import { secureStore } from '../adapters/secure-store.native';
import { streamFetch } from '../adapters/stream.native';
import { createMobileSession } from './session';
import { createMobileApi } from './api';

const apiBase = resolveApiBase({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  extraApiBase: (Constants.expoConfig?.extra as { apiBase?: unknown } | undefined)?.apiBase,
});

/** App-wide session (SecureStore tokens + expo/fetch streaming) and the
 *  core-bound api. Screens import these. Call `session.hydrate()` once at
 *  startup to restore a persisted login. */
export const session = createMobileSession({
  apiBase,
  tokenStore: createTokenStore(secureStore),
  fetchImpl: streamFetch,
});

export const api = createMobileApi(session, apiBase);
```

- [ ] **Step 11: Verify typecheck + tests**

Run: `pnpm --filter @finby/core build && pnpm --filter finby-mobile typecheck && pnpm --filter finby-mobile test`
Expected: all PASS.

- [ ] **Step 12: Commit**

```bash
git add apps/mobile/src/lib apps/mobile/src/adapters/stream.native.ts
git commit -m "feat(mobile): session container + core-bound api (architecture proof)"
```

---

### Task 8: EAS config + run/build documentation

**Files:**
- Create: `apps/mobile/eas.json`, `apps/mobile/README.md`

**Interfaces:**
- Produces: EAS build profiles and the documented commands for running the app in Expo Go and building/submitting via EAS — to be run on the user's machine.

- [ ] **Step 1: Create the EAS build profiles**

`apps/mobile/eas.json`:
```json
{
  "cli": { "version": ">= 12.0.0", "appVersionSource": "remote" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {}
  }
}
```

- [ ] **Step 2: Write the run/build documentation**

`apps/mobile/README.md`:
````markdown
# Finby Mobile (Expo)

React Native app sharing `@finby/core` (API/business logic) and `@finby/shared`
(domain types) with the web app. Platform specifics (secure token storage,
streaming transport, analytics) live behind adapters in `src/adapters/`.

## Prerequisites (run on your machine — not the CI/Linux dev box)

- Node >= 20, pnpm 10.28.1 (repo root `pnpm install`)
- Expo Go app on a physical device, or an iOS simulator (macOS) / Android emulator
- An Expo account for EAS builds (`npx expo login`)

## Run in development

```bash
# from repo root
pnpm --filter @finby/shared build && pnpm --filter @finby/core build
pnpm --filter finby-mobile start          # opens Expo dev server; scan QR with Expo Go
# or: pnpm --filter finby-mobile ios / android
```

Set the API base for a device (the app defaults to http://localhost:3001/api/v1,
which a physical device cannot reach — point it at your machine's LAN IP or a
deployed API):

```bash
EXPO_PUBLIC_API_URL=http://192.168.x.x:3001/api/v1 pnpm --filter finby-mobile start
```

Optional analytics: `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST`.

## Unit tests (run anywhere, incl. CI)

```bash
pnpm --filter finby-mobile test        # Vitest — adapter + session + api logic
pnpm --filter finby-mobile typecheck
```

Native binding files (`*.native.ts`) and screens are verified on device, not by Vitest.

## EAS builds (cloud — no local Xcode/Android Studio needed)

```bash
npm i -g eas-cli            # or: npx eas-cli@latest
cd apps/mobile
eas login
eas build:configure        # links the Expo project (writes the project id)
eas build --profile development --platform ios      # or android
eas build --profile production --platform all
eas submit --profile production --platform ios       # App Store Connect
eas submit --profile production --platform android    # Play Console
```

## Architecture note

`src/lib/session.ts` builds `@finby/core`'s http + authed client with
SecureStore-backed tokens and `expo/fetch` for streaming; `src/lib/api.ts`
binds every `createXxxApi` factory to that session. Web and mobile therefore
share one API/business-logic implementation — only the injected adapters differ.
````

- [ ] **Step 3: Verify the app still typechecks + tests pass (no code change, but confirm the tree is clean)**

Run: `pnpm --filter finby-mobile typecheck && pnpm --filter finby-mobile test`
Expected: both PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/eas.json apps/mobile/README.md
git commit -m "docs(mobile): EAS profiles + run/build instructions"
```

---

## Phase 2 Done — What Exists After This Plan

- A `finby-mobile` Expo app that boots (verified on device) and whose adapter/session/api logic is fully unit-tested here.
- Platform adapters (SecureStore token store, posthog analytics, expo/fetch streaming) with logic decoupled from native imports for testability.
- A mobile session that reuses `@finby/core`'s http + authed client (SecureStore tokens + `expo/fetch` streaming via the new injectable `fetchImpl`), and a `createMobileApi` binding every core factory — proving web and mobile share one API/business-logic implementation.
- EAS profiles + documented run/build steps for the user's machine.
- `@finby/core` gained one backward-compatible capability (`fetchImpl` injection); web unchanged and green.

## Deferred to Later Phases (intentional)

- **Real feature screens + native UI primitives** (Input/Button/Dropdown/etc.) — Phase 3+ (auth+biometric first).
- **Biometric unlock** (`expo-local-authentication`) — Phase 3.
- **Native push** (`expo-notifications`) — Phase 6.
- **Sentry** (`@sentry/react-native`) — fold into a later phase.
- **On-device validation** of streaming chat, SecureStore, and analytics — documented; run during Phase 4/feature work on a device.

## Next Phase

Phase 3 — auth + secure storage + biometric unlock: login/register/onboarding screens, the native UI primitives, biometric app-lock gating on the hydrated session. Gets its own plan via the writing-plans skill.
