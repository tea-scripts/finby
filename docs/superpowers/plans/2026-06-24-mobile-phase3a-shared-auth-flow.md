# Mobile Phase 3a — Shared Auth Flow (core + web/mobile refactor) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Share the login/register/logout network calls in `@finby/core`, refactor the web store to use them (persistence unchanged), and give the mobile session + a mobile auth store login/register/logout — so both platforms drive auth through one implementation.

**Architecture:** Extend `@finby/core`'s `createAuthApi` with `login`/`register`/`logout` (pure network calls via the injected `apiFetch`, returning `AuthResult`). The web Zustand store calls these for the network and keeps its existing Zustand+localStorage token/state persistence (zero logout-on-deploy risk). The mobile `createMobileSession` gains `login`/`register`/`logout` built on the same `createAuthApi` + its SecureStore `setSession`/`clearSession`; a mobile Zustand auth store holds `user`/`workspace`/`status` and exposes those actions. Screens/primitives/biometric are Phase 3b.

**Tech Stack:** TypeScript (strict), `@finby/core`, `@finby/shared`, Zustand, Vitest. Mobile = Expo SDK 54 (RN 0.81).

## Global Constraints

- Node `>=20`; pnpm `10.28.1`. Use `expo install` for any Expo/native dep (SDK-compatible pins).
- Commit messages: NO AI-attribution / "Generated with" boilerplate. One logical change per commit.
- TypeScript strict + `noUncheckedIndexedAccess`.
- `@finby/core` stays platform-agnostic (ESLint guard on `packages/core/src/**`): no localStorage/window/expo/react/react-native/zustand imports; everything injected.
- Web token persistence must NOT change (existing logged-in users must stay logged in): the web store keeps its Zustand `persist` of `accessToken`/`refreshToken`/`user`/`workspace`; only the network-call source moves to core.
- Behavior-preserving on web: `useAuth`'s public `AuthState` surface and runtime behavior unchanged; existing web tests stay green.
- Whole-repo gate after changes: `@finby/core` tests, `finby-web` typecheck + tests (300), `finby-mobile` typecheck + tests, `pnpm lint`.
- Fresh-checkout note: build `@finby/shared` + `@finby/core` before consumers; mobile needs `pnpm install` for new deps.

---

### Task 1: Add `login`/`register`/`logout` to `@finby/core` `createAuthApi`

**Files:**
- Modify: `packages/core/src/api/auth-api.ts`
- Modify: `packages/core/src/api/auth-api.test.ts`

**Interfaces:**
- Consumes: `ApiFetch`, `AuthedFetch` (existing); `AuthResult`, `RegisterInput` from `@finby/shared`.
- Produces: `AuthApi` gains `login(email: string, password: string): Promise<AuthResult>`, `register(input: RegisterInput): Promise<AuthResult>`, `logout(refreshToken: string | null): Promise<void>`. login/register POST via `apiFetch` (unauthenticated); logout best-effort POSTs `{ refreshToken }` and swallows errors.

- [ ] **Step 1: Write the failing tests**

Add to `packages/core/src/api/auth-api.test.ts`:
```ts
describe('createAuthApi auth flow', () => {
  it('login POSTs credentials and returns the AuthResult', async () => {
    const authed = vi.fn();
    const apiFetch = vi.fn(async () => ({ accessToken: 'a', refreshToken: 'r', user: { id: 'u1' }, workspace: { id: 'w1' } }) as never);
    const api = createAuthApi({ authed, apiFetch });
    const res = await api.login('e@x.com', 'pw');
    expect(apiFetch).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'e@x.com', password: 'pw' }),
    });
    expect(res).toMatchObject({ accessToken: 'a', user: { id: 'u1' } });
    expect(authed).not.toHaveBeenCalled();
  });

  it('register POSTs the input and returns the AuthResult', async () => {
    const apiFetch = vi.fn(async () => ({ accessToken: 'a', refreshToken: 'r', user: { id: 'u1' }, workspace: { id: 'w1' } }) as never);
    const api = createAuthApi({ authed: vi.fn(), apiFetch });
    const input = { displayName: 'Tee', email: 'e@x.com', password: 'pw', baseCurrency: 'USD', timezone: 'UTC' };
    await api.register(input);
    expect(apiFetch).toHaveBeenCalledWith('/auth/register', { method: 'POST', body: JSON.stringify(input) });
  });

  it('logout POSTs the refreshToken and swallows network errors', async () => {
    const apiFetch = vi.fn(async () => { throw new Error('network'); });
    const api = createAuthApi({ authed: vi.fn(), apiFetch });
    await expect(api.logout('r1')).resolves.toBeUndefined();
    expect(apiFetch).toHaveBeenCalledWith('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: 'r1' }) });
  });

  it('logout with no refresh token does nothing', async () => {
    const apiFetch = vi.fn();
    const api = createAuthApi({ authed: vi.fn(), apiFetch });
    await api.logout(null);
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @finby/core test`
Expected: FAIL — `api.login` / `register` / `logout` are not functions.

- [ ] **Step 3: Implement**

In `packages/core/src/api/auth-api.ts`: add the import and extend the interface + factory.

Add at top (after the existing import line):
```ts
import type { AuthResult, RegisterInput } from '@finby/shared';
```
Add to the `AuthApi` interface:
```ts
  login(email: string, password: string): Promise<AuthResult>;
  register(input: RegisterInput): Promise<AuthResult>;
  logout(refreshToken: string | null): Promise<void>;
```
Add to the returned object in `createAuthApi` (alongside the existing methods):
```ts
    login(email, password) {
      return apiFetch<AuthResult>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
    },
    register(input) {
      return apiFetch<AuthResult>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    async logout(refreshToken) {
      if (!refreshToken) return;
      // Best-effort server-side revocation; never block sign-out on it.
      try {
        await apiFetch<void>('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        });
      } catch {
        /* ignore — clearing local state is what matters */
      }
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @finby/core test`
Expected: PASS.

- [ ] **Step 5: Build core and confirm web still typechecks (no consumer change yet)**

Run: `pnpm --filter @finby/core build && pnpm --filter finby-web typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/api/auth-api.ts packages/core/src/api/auth-api.test.ts
git commit -m "feat(core): add login/register/logout network calls to createAuthApi"
```

---

### Task 2: Refactor the web store onto core's auth flow

**Files:**
- Modify: `apps/web/src/lib/store.ts`

**Interfaces:**
- Consumes: `createAuthApi` from `@finby/core`; the store's existing `authedClient`, `apiFetch`, `normalizeUser`, `set`/`get`, `identifyUser`/`track`/`resetAnalytics`.
- Produces: no public-surface change — `useAuth`'s `login`/`register`/`logout` keep the same signatures and behavior; only the network call is sourced from `createAuthApi`. Token/state persistence (Zustand `persist`) is unchanged.

- [ ] **Step 1: Add the core import**

In `apps/web/src/lib/store.ts`, add to the `@finby/core` import:
```ts
import { createAuthedClient, createAuthApi } from '@finby/core';
```

- [ ] **Step 2: Construct the auth API inside the store closure**

Immediately after the `authedClient` is constructed (inside `create<AuthState>()(persist((set, get) => { ... }))`), add:
```ts
      const authApi = createAuthApi({ authed: authedClient.authed, apiFetch });
```

- [ ] **Step 3: Replace `register` to use `authApi.register`**

Replace the `register` action body with (network via core, state + analytics unchanged):
```ts
      register: async (input) => {
        const result = await authApi.register(input);
        set({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          user: normalizeUser(result.user),
          workspace: result.workspace,
          status: 'authed',
          activeWorkspaceId: result.workspace.id,
        });
        identifyUser(result.user.id, result.workspace.tier);
        track('signed_up', { method: 'password' });
      },
```

- [ ] **Step 4: Replace `login` to use `authApi.login`**

```ts
      login: async (email, password) => {
        const result = await authApi.login(email, password);
        set({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          user: normalizeUser(result.user),
          workspace: result.workspace,
          status: 'authed',
          activeWorkspaceId: result.workspace.id,
        });
        identifyUser(result.user.id, result.workspace.tier);
      },
```

- [ ] **Step 5: Replace `logout` to use `authApi.logout`**

```ts
      logout: async () => {
        await authApi.logout(get().refreshToken);
        set({ ...CLEARED });
        resetAnalytics();
      },
```
The direct `apiFetch<AuthResult>('/auth/...')` / `apiFetch<void>('/auth/logout', ...)` calls in these three actions are now gone. `apiFetch` is still imported (used by `authApi` construction `{ http: { baseUrl: API_BASE, apiFetch } }` and the `createAuthApi` call) and `API_BASE` is still used — leave both imports. `AuthResult` import from `./types` is no longer referenced in store.ts (the result type now comes from core's return) — remove `AuthResult` from the `import type { ... } from './types'` line, leaving `ApiUser, ApiWorkspace, RegisterInput, WorkspaceMembershipSummary`.

- [ ] **Step 6: Build core, verify web stays green**

Run: `pnpm --filter @finby/core build && pnpm --filter finby-web typecheck && pnpm --filter finby-web test`
Expected: all PASS — `apps/web/src/lib/store.test.ts` and the full suite (300) green; login/register/logout behavior identical (the store's tests mock `apiFetch`/the network, which `createAuthApi` calls through).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/store.ts
git commit -m "refactor(web): drive store login/register/logout through @finby/core authApi"
```

---

### Task 3: Add `login`/`register`/`logout` to the mobile session

**Files:**
- Modify: `apps/mobile/src/lib/session.ts`
- Modify: `apps/mobile/src/lib/session.test.ts`

**Interfaces:**
- Consumes: `createAuthApi`, `AuthResult`, `RegisterInput` from `@finby/core`/`@finby/shared`; the existing in-memory token state + `setSession`/`clearSession`.
- Produces: `MobileSession` gains `login(email, password): Promise<AuthResult>`, `register(input: RegisterInput): Promise<AuthResult>`, `logout(): Promise<void>`. `login`/`register` call `authApi.login`/`register` then `setSession({ accessToken, refreshToken })` and return the `AuthResult`; `logout` calls `authApi.logout(refreshToken)` then `clearSession()`.

- [ ] **Step 1: Write the failing tests**

Add to `apps/mobile/src/lib/session.test.ts`:
```ts
describe('createMobileSession auth flow', () => {
  it('login calls the API, persists tokens, and returns the AuthResult', async () => {
    const tokenStore = createTokenStore(fakeSecureStore());
    const authResult = { accessToken: 'a1', refreshToken: 'r1', user: { id: 'u1' }, workspace: { id: 'w1' } };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(authResult), { status: 200 })) as unknown as typeof fetch;
    const session = createMobileSession({ apiBase: 'https://api.test/v1', tokenStore, fetchImpl });
    const res = await session.login('e@x.com', 'pw');
    expect(res).toMatchObject({ user: { id: 'u1' } });
    expect(session.getAccessToken()).toBe('a1');
    await expect(tokenStore.load()).resolves.toEqual({ accessToken: 'a1', refreshToken: 'r1' });
  });

  it('logout clears the session', async () => {
    const tokenStore = createTokenStore(fakeSecureStore());
    const fetchImpl = vi.fn(async () => new Response('null', { status: 200 })) as unknown as typeof fetch;
    const session = createMobileSession({ apiBase: 'https://api.test/v1', tokenStore, fetchImpl });
    await session.setSession({ accessToken: 'a1', refreshToken: 'r1' });
    await session.logout();
    expect(session.getAccessToken()).toBeNull();
    await expect(tokenStore.load()).resolves.toBeNull();
  });
});
```
(`fakeSecureStore` and `createTokenStore` are already imported at the top of `session.test.ts` from Phase 2.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-mobile test`
Expected: FAIL — `session.login` / `session.logout` are not functions.

- [ ] **Step 3: Implement**

In `apps/mobile/src/lib/session.ts`:

(a) Extend the imports:
```ts
import { createAuthedClient, createAuthApi, createHttpClient, type AuthedFetch, type AuthedStream, type AuthResult, type RegisterInput, type TokenPair } from '@finby/core';
```

(b) Add to the `MobileSession` interface:
```ts
  login(email: string, password: string): Promise<AuthResult>;
  register(input: RegisterInput): Promise<AuthResult>;
  logout(): Promise<void>;
```

(c) After the `client` is constructed, build the auth API on the same http client:
```ts
  const authApi = createAuthApi({ authed: client.authed, apiFetch: http.apiFetch });
```

(d) Add the three methods to the returned object (they reuse the existing `setSession`/`clearSession` defined in the same object — define `login`/`register`/`logout` to call the local closures `setSession`/`clearSession`; since those are object methods, capture token mutation inline to avoid `this`):
```ts
    async login(email, password) {
      const result = await authApi.login(email, password);
      accessToken = result.accessToken;
      refreshToken = result.refreshToken;
      await deps.tokenStore.save({ accessToken: result.accessToken, refreshToken: result.refreshToken });
      return result;
    },
    async register(input) {
      const result = await authApi.register(input);
      accessToken = result.accessToken;
      refreshToken = result.refreshToken;
      await deps.tokenStore.save({ accessToken: result.accessToken, refreshToken: result.refreshToken });
      return result;
    },
    async logout() {
      await authApi.logout(refreshToken);
      accessToken = null;
      refreshToken = null;
      await deps.tokenStore.clear();
    },
```
(These mutate the same closure-scoped `accessToken`/`refreshToken` the authed client reads — consistent with `setSession`/`clearSession`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @finby/core build && pnpm --filter finby-mobile test`
Expected: PASS — new auth-flow tests + the existing session tests green.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter finby-mobile typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/lib/session.ts apps/mobile/src/lib/session.test.ts
git commit -m "feat(mobile): add login/register/logout to the mobile session"
```

---

### Task 4: Mobile auth store (user/workspace/status + actions)

**Files:**
- Create: `apps/mobile/src/lib/auth-store.ts`
- Create: `apps/mobile/src/lib/auth-store.test.ts`
- Modify: `apps/mobile/package.json` (add `zustand`)

**Interfaces:**
- Consumes: `MobileSession` (Task 3); `ApiUser`, `ApiWorkspace`, `RegisterInput` from `@finby/shared`.
- Produces: `createAuthStore(session: MobileSession)` returning a Zustand store with state `{ user: ApiUser | null; workspace: ApiWorkspace | null; status: 'idle' | 'authed' }` and actions `login(email,password)`, `register(input)`, `logout()`. (A `useAuthStore` singleton bound to the app's real session is created in the composition root in Phase 3b; this task ships the testable factory. Cold-start session restore — `hydrate` + identity persistence + the navigation gate — is designed in Phase 3b, where `/auth/me`'s real `{ user }` shape and workspace restoration are handled.)

- [ ] **Step 1: Add zustand to the mobile app**

Run:
```bash
pnpm --filter finby-mobile add zustand
pnpm install
```
Expected: `zustand` added to `apps/mobile/package.json` dependencies.

- [ ] **Step 2: Write the failing test**

`apps/mobile/src/lib/auth-store.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { createAuthStore } from './auth-store';
import type { MobileSession } from './session';

function fakeSession(overrides: Partial<MobileSession> = {}): MobileSession {
  return {
    authed: vi.fn(),
    authedStream: vi.fn(),
    tryRefresh: vi.fn(async () => false),
    setSession: vi.fn(async () => {}),
    clearSession: vi.fn(async () => {}),
    hydrate: vi.fn(async () => false),
    getAccessToken: () => null,
    login: vi.fn(async () => ({ accessToken: 'a', refreshToken: 'r', user: { id: 'u1' }, workspace: { id: 'w1', tier: 'FREE' } }) as never),
    register: vi.fn(async () => ({ accessToken: 'a', refreshToken: 'r', user: { id: 'u2' }, workspace: { id: 'w2', tier: 'FREE' } }) as never),
    logout: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('createAuthStore', () => {
  it('starts idle with no user', () => {
    const store = createAuthStore(fakeSession());
    expect(store.getState().status).toBe('idle');
    expect(store.getState().user).toBeNull();
  });

  it('login sets user/workspace and status authed', async () => {
    const store = createAuthStore(fakeSession());
    await store.getState().login('e@x.com', 'pw');
    expect(store.getState().status).toBe('authed');
    expect(store.getState().user).toMatchObject({ id: 'u1' });
    expect(store.getState().workspace).toMatchObject({ id: 'w1' });
  });

  it('register sets user/workspace and status authed', async () => {
    const store = createAuthStore(fakeSession());
    await store.getState().register({ displayName: 'Tee', email: 'e@x.com', password: 'pw', baseCurrency: 'USD', timezone: 'UTC' });
    expect(store.getState().status).toBe('authed');
    expect(store.getState().user).toMatchObject({ id: 'u2' });
  });

  it('logout clears user/workspace and sets status idle', async () => {
    const store = createAuthStore(fakeSession());
    await store.getState().login('e@x.com', 'pw');
    await store.getState().logout();
    expect(store.getState().status).toBe('idle');
    expect(store.getState().user).toBeNull();
    expect(store.getState().workspace).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter finby-mobile test`
Expected: FAIL — `Cannot find module './auth-store'`.

- [ ] **Step 4: Implement**

`apps/mobile/src/lib/auth-store.ts`:
```ts
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ApiUser, ApiWorkspace, RegisterInput } from '@finby/shared';
import type { MobileSession } from './session';

export interface AuthState {
  user: ApiUser | null;
  workspace: ApiWorkspace | null;
  status: 'idle' | 'authed';
  login(email: string, password: string): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  logout(): Promise<void>;
}

/** Mobile auth store. Holds identity + status; drives the session for the
 *  network/token side. Cold-start session restore (hydrate + identity
 *  persistence + navigation gate) is added in Phase 3b. */
export function createAuthStore(session: MobileSession): StoreApi<AuthState> {
  return createStore<AuthState>((set) => ({
    user: null,
    workspace: null,
    status: 'idle',

    login: async (email, password) => {
      const result = await session.login(email, password);
      set({ user: result.user, workspace: result.workspace, status: 'authed' });
    },
    register: async (input) => {
      const result = await session.register(input);
      set({ user: result.user, workspace: result.workspace, status: 'authed' });
    },
    logout: async () => {
      await session.logout();
      set({ user: null, workspace: null, status: 'idle' });
    },
  }));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @finby/core build && pnpm --filter finby-mobile test`
Expected: PASS.

- [ ] **Step 6: Typecheck + full gate**

Run: `pnpm --filter finby-mobile typecheck && pnpm lint`
Expected: PASS (lint 0 errors; pre-existing `sw.js` warning only).

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/lib/auth-store.ts apps/mobile/src/lib/auth-store.test.ts apps/mobile/package.json pnpm-lock.yaml
git commit -m "feat(mobile): auth store (user/workspace/status + login/register/logout/hydrate)"
```

---

## Phase 3a Done — What Exists After This Plan

- `@finby/core` `createAuthApi` owns the login/register/logout network calls; web and mobile both use them.
- Web store drives auth through core with unchanged persistence + public surface (web green, 300 tests).
- Mobile session can login/register/logout (persisting tokens to SecureStore), and a mobile Zustand auth store holds identity/status and exposes those actions.

## Deferred to Phase 3b

- Native UI primitives (Button/Input/PasswordInput/Field/ScreenContainer/Dropdown/Toggle) + RNTL setup.
- Auth screens (Login/Register/Onboarding/Forgot-Password) + expo-router `(auth)`/`(app)` groups + navigation gate + composition-root `useAuthStore` bound to the real session.
- **Cold-start session restore:** `hydrate` (load tokens + restore identity) + identity persistence + the navigation gate. During 3b planning, read the `apps/api` `/auth/me` handler to confirm its real shape (the web store treats it as `{ user }` only — workspace is restored from persisted state, not re-fetched) and design mobile identity persistence accordingly.
- Biometric adapter + `BiometricGate` + lock state/Toggle.
