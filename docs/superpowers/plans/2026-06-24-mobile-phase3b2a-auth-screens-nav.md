# Mobile Phase 3b-2a — Auth Screens + Nav Gate + Session Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Expo app a working authenticated entry — Login, Register, first-launch Onboarding carousel, and Forgot-Password screens, wired through expo-router `(auth)`/`(app)` route groups with a root navigation gate that restores a persisted session on cold start.

**Architecture:** Reuse the Phase-2 `createMobileSession` (tokens in SecureStore) and the Phase-3a mobile auth store. Add a SecureStore-backed **identity store** (persists `user`+`workspace`, mirroring how web persists its zustand store to localStorage) and an **onboarding flag**, so cold-start restore is a local rehydrate — no lossy `/auth/me`+`/auth/workspaces` reconstruction. Screens are built test-first with RNTL from the existing Phase-3b-1 primitives; they call store actions only and let the root gate drive navigation by reacting to `status`.

**Tech Stack:** Expo SDK 54 (React 19.1, RN 0.81.5), expo-router 6, NativeWind 4.2 (static styles only), zustand/vanilla, `@finby/core` (`ApiError`, auth API), `@finby/shared` (`CURRENCIES`, `RegisterInput`, `passwordStrength`), Vitest (`*.test.ts` logic) + jest-expo/RNTL 14 (`*.test.tsx` components), `expo-localization` (new — device timezone).

## Global Constraints

- **Onboarding mirrors web:** a 3-slide first-launch intro carousel (gated by a persisted flag), finishing → Login. Base currency is collected in **Register** (the API's `RegisterInput` requires `baseCurrency` + `timezone`). There is **no** separate currency-setup screen. Register includes a **Terms-acceptance gate** (legal parity with web).
- **Identity restore = persist locally.** Persist `{ user, workspace }` to SecureStore on login/register; clear on logout; rehydrate on cold start. Do **not** reconstruct workspace from `/auth/workspaces` (it lacks `preferredCurrencies` and uses `workspaceId`, not `id`).
- **This plan does NOT add biometric lock.** That is Phase 3b-2b (follow-up). Do not add `expo-local-authentication`, `BiometricGate`, or lock state here.
- **`@finby/core` and `@finby/shared` are NOT modified** in this plan. No new core API surface is needed.
- **Imports inside `apps/mobile` are relative** (e.g. `../components/ui/button`). The `@/*` tsconfig path exists but is unused at runtime (no babel alias) — do not introduce it.
- **Test-runner split:** Vitest runs `*.test.ts` (node logic); jest-expo runs `*.test.tsx` (RNTL components). Never overlap. Do NOT mock `react-native` or `@testing-library/react-native`.
- **RNTL 14:** `render` AND state-changing `fireEvent.press` are async — always `await` them inside `async it()`.
- **Test files must NOT live under `apps/mobile/app/`** — every `.tsx` there becomes a route. Screen components live in `apps/mobile/src/screens/` (tested there); `app/(group)/*.tsx` route files are thin re-exports.
- **NativeWind static styling only** — no reanimated/worklets/animations.
- **Commits:** atomic (one logical change each); **NO** AI-attribution trailers or "Generated with" boilerplate (web validator scans for it).
- Single new dependency permitted: `expo-localization` (installed via `expo install`, in Expo Go).

---

## File Structure

**New adapters (logic, Vitest-tested):**
- `apps/mobile/src/adapters/identity-store.ts` — persist `{ user, workspace }` JSON in SecureStore under `finby.identity`.
- `apps/mobile/src/adapters/onboarding-flag.ts` — persist the "seen onboarding" flag under `finby.onboarded`.
- `apps/mobile/src/adapters/localization.native.ts` — `getDeviceTimeZone()` via expo-localization (native; mocked in tests).

**Modified lib:**
- `apps/mobile/src/lib/auth-store.ts` — add `'loading'` status + `onboarded`, actions `hydrate`/`completeOnboarding`; persist identity on login/register; new deps-object signature.
- `apps/mobile/src/lib/runtime.native.ts` — compose `identityStore`, `onboardingFlag`, and export `authStore`.

**New lib:**
- `apps/mobile/src/lib/use-auth-store.ts` — `useAuthStore(selector)` React hook + `authStore` re-export.

**New components (auth-specific):**
- `apps/mobile/src/components/auth/auth-header.tsx` — title + subtitle.
- `apps/mobile/src/components/auth/error-banner.tsx` — inline error banner.
- `apps/mobile/src/components/auth/terms-gate.tsx` — Toggle + Terms/Privacy links.

**New screens (tested in `src/screens/`):**
- `apps/mobile/src/screens/login-screen.tsx`
- `apps/mobile/src/screens/register-screen.tsx`
- `apps/mobile/src/screens/forgot-password-screen.tsx`
- `apps/mobile/src/screens/onboarding-screen.tsx`

**New/modified route files (thin, untested):**
- `apps/mobile/app/_layout.tsx` (modify — root gate + SafeAreaProvider)
- `apps/mobile/app/index.tsx` (modify — splash)
- `apps/mobile/app/(auth)/_layout.tsx`, `login.tsx`, `register.tsx`, `forgot-password.tsx`, `onboarding.tsx`
- `apps/mobile/app/(app)/_layout.tsx`, `index.tsx`

---

## Reference: current contracts (read-only — already exist)

- `MobileSession` (`src/lib/session.ts`): `login(email,password): Promise<AuthResult>`, `register(input): Promise<AuthResult>`, `logout(): Promise<void>`, `hydrate(): Promise<boolean>` (loads tokens into memory), `clearSession(): Promise<void>`.
- `AuthResult` (`@finby/shared`): `{ user: ApiUser; workspace: ApiWorkspace; accessToken: string; refreshToken: string }`.
- `SecureStoreLike` (`src/adapters/token-store.ts`): `{ getItemAsync(k): Promise<string|null>; setItemAsync(k,v): Promise<void>; deleteItemAsync(k): Promise<void> }`. Reuse this type.
- `secureStore` (`src/adapters/secure-store.native.ts`): the device `SecureStoreLike` binding.
- Primitives (`src/components/ui/`): `Button({variant?,loading?,disabled?,onPress,children})`, `Input(TextInputProps & {invalid?})`, `PasswordInput(TextInputProps & {invalid?})`, `Field({label,error?,hint?,children})`, `ScreenContainer({children})`, `Dropdown<T>({value,options,onSelect,placeholder?,accessibilityLabel?})`, `PasswordStrengthMeter` (default export name: confirm in file), `Toggle({value,onValueChange,accessibilityLabel?})`.
- `api` (`src/lib/runtime.native.ts`): `api.auth.forgotPassword(email): Promise<{message:string}>`.
- `ApiError` exported from `@finby/core`.

---

### Task 1: Identity store adapter

Persist the restorable identity (`user`+`workspace`) so cold start rehydrates without a network round-trip.

**Files:**
- Create: `apps/mobile/src/adapters/identity-store.ts`
- Test: `apps/mobile/src/adapters/identity-store.test.ts`

**Interfaces:**
- Consumes: `SecureStoreLike` from `./token-store`; `ApiUser`, `ApiWorkspace` from `@finby/shared`.
- Produces: `interface Identity { user: ApiUser; workspace: ApiWorkspace }`; `interface IdentityStore { load(): Promise<Identity|null>; save(identity: Identity): Promise<void>; clear(): Promise<void> }`; `createIdentityStore(secureStore: SecureStoreLike): IdentityStore`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/src/adapters/identity-store.test.ts
import { describe, expect, it } from 'vitest';
import { createIdentityStore, type Identity } from './identity-store';
import type { SecureStoreLike } from './token-store';

function fakeStore(): SecureStoreLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItemAsync: async (k) => map.get(k) ?? null,
    setItemAsync: async (k, v) => void map.set(k, v),
    deleteItemAsync: async (k) => void map.delete(k),
  };
}

const IDENTITY: Identity = {
  user: { id: 'u1', displayName: 'Tee', email: 'e@x.com', emailVerified: true, timezone: 'UTC', accountNumber: null, preferences: {} as never, currentStreak: 0, longestStreak: 0 },
  workspace: { id: 'w1', name: 'Home', slug: 'home', tier: 'FREE' as never, baseCurrency: 'USD', preferredCurrencies: ['USD'] },
};

describe('createIdentityStore', () => {
  it('round-trips save → load', async () => {
    const store = createIdentityStore(fakeStore());
    await store.save(IDENTITY);
    expect(await store.load()).toEqual(IDENTITY);
  });

  it('load returns null when nothing is stored', async () => {
    expect(await createIdentityStore(fakeStore()).load()).toBeNull();
  });

  it('load returns null on corrupt JSON', async () => {
    const fs = fakeStore();
    fs.map.set('finby.identity', '{not json');
    expect(await createIdentityStore(fs).load()).toBeNull();
  });

  it('load returns null when shape is incomplete', async () => {
    const fs = fakeStore();
    fs.map.set('finby.identity', JSON.stringify({ user: IDENTITY.user }));
    expect(await createIdentityStore(fs).load()).toBeNull();
  });

  it('clear removes the stored identity', async () => {
    const fs = fakeStore();
    const store = createIdentityStore(fs);
    await store.save(IDENTITY);
    await store.clear();
    expect(await store.load()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-mobile exec vitest run src/adapters/identity-store.test.ts`
Expected: FAIL — cannot find module `./identity-store`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/mobile/src/adapters/identity-store.ts
import type { ApiUser, ApiWorkspace } from '@finby/shared';
import type { SecureStoreLike } from './token-store';

const IDENTITY_KEY = 'finby.identity';

export interface Identity {
  user: ApiUser;
  workspace: ApiWorkspace;
}

export interface IdentityStore {
  load(): Promise<Identity | null>;
  save(identity: Identity): Promise<void>;
  clear(): Promise<void>;
}

/** Persist the restorable identity (user + workspace) so cold start rehydrates
 *  without a network call. Mirrors how web persists its auth store to
 *  localStorage; the SecureStore JSON is small (well under the platform limit). */
export function createIdentityStore(secureStore: SecureStoreLike): IdentityStore {
  return {
    async load() {
      const raw = await secureStore.getItemAsync(IDENTITY_KEY);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as Partial<Identity>;
        if (parsed.user && parsed.workspace) {
          return { user: parsed.user, workspace: parsed.workspace };
        }
        return null;
      } catch {
        return null;
      }
    },
    async save(identity) {
      await secureStore.setItemAsync(IDENTITY_KEY, JSON.stringify(identity));
    },
    async clear() {
      await secureStore.deleteItemAsync(IDENTITY_KEY);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-mobile exec vitest run src/adapters/identity-store.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/adapters/identity-store.ts apps/mobile/src/adapters/identity-store.test.ts
git commit -m "feat(mobile): identity store adapter (persist user+workspace for cold-start restore)"
```

---

### Task 2: Onboarding flag adapter

A persisted "has seen first-launch onboarding" flag, surviving logout (mirrors web's `finby_onboarded` localStorage flag).

**Files:**
- Create: `apps/mobile/src/adapters/onboarding-flag.ts`
- Test: `apps/mobile/src/adapters/onboarding-flag.test.ts`

**Interfaces:**
- Consumes: `SecureStoreLike` from `./token-store`.
- Produces: `interface OnboardingFlag { wasSeen(): Promise<boolean>; markSeen(): Promise<void> }`; `createOnboardingFlag(secureStore: SecureStoreLike): OnboardingFlag`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/src/adapters/onboarding-flag.test.ts
import { describe, expect, it } from 'vitest';
import { createOnboardingFlag } from './onboarding-flag';
import type { SecureStoreLike } from './token-store';

function fakeStore(): SecureStoreLike {
  const map = new Map<string, string>();
  return {
    getItemAsync: async (k) => map.get(k) ?? null,
    setItemAsync: async (k, v) => void map.set(k, v),
    deleteItemAsync: async (k) => void map.delete(k),
  };
}

describe('createOnboardingFlag', () => {
  it('wasSeen is false before markSeen', async () => {
    expect(await createOnboardingFlag(fakeStore()).wasSeen()).toBe(false);
  });

  it('wasSeen is true after markSeen', async () => {
    const flag = createOnboardingFlag(fakeStore());
    await flag.markSeen();
    expect(await flag.wasSeen()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-mobile exec vitest run src/adapters/onboarding-flag.test.ts`
Expected: FAIL — cannot find module `./onboarding-flag`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/mobile/src/adapters/onboarding-flag.ts
import type { SecureStoreLike } from './token-store';

const ONBOARDED_KEY = 'finby.onboarded';

export interface OnboardingFlag {
  wasSeen(): Promise<boolean>;
  markSeen(): Promise<void>;
}

/** Tracks whether the first-launch onboarding carousel has been shown.
 *  Persists across logout (intentionally not cleared by sign-out). */
export function createOnboardingFlag(secureStore: SecureStoreLike): OnboardingFlag {
  return {
    async wasSeen() {
      return (await secureStore.getItemAsync(ONBOARDED_KEY)) === '1';
    },
    async markSeen() {
      await secureStore.setItemAsync(ONBOARDED_KEY, '1');
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-mobile exec vitest run src/adapters/onboarding-flag.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/adapters/onboarding-flag.ts apps/mobile/src/adapters/onboarding-flag.test.ts
git commit -m "feat(mobile): onboarding-flag adapter (first-launch carousel gate)"
```

---

### Task 3: Auth store — loading status, hydrate, onboarding, identity persistence

Extend the Phase-3a mobile auth store: a `'loading'` start state for the gate, cold-start `hydrate()`, `completeOnboarding()`, and identity persistence on login/register/logout. **Signature changes** from `createAuthStore(session)` to a deps object.

**Files:**
- Modify: `apps/mobile/src/lib/auth-store.ts`
- Test (rewrite): `apps/mobile/src/lib/auth-store.test.ts`

**Interfaces:**
- Consumes: `MobileSession` (`./session`), `IdentityStore` (`../adapters/identity-store`), `OnboardingFlag` (`../adapters/onboarding-flag`), `ApiUser`/`ApiWorkspace`/`RegisterInput` (`@finby/shared`).
- Produces: `AuthState` with `status: 'loading' | 'idle' | 'authed'`, `onboarded: boolean`, and actions `hydrate(): Promise<void>`, `login`, `register`, `logout`, `completeOnboarding(): Promise<void>`. New signature `createAuthStore(deps: { session: MobileSession; identityStore: IdentityStore; onboardingFlag: OnboardingFlag }): StoreApi<AuthState>`.

- [ ] **Step 1: Rewrite the test (failing)**

```ts
// apps/mobile/src/lib/auth-store.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createAuthStore } from './auth-store';
import type { MobileSession } from './session';
import type { Identity, IdentityStore } from '../adapters/identity-store';
import type { OnboardingFlag } from '../adapters/onboarding-flag';

const USER = { id: 'u1' } as never;
const WORKSPACE = { id: 'w1', tier: 'FREE' } as never;
const AUTH_RESULT = { accessToken: 'a', refreshToken: 'r', user: USER, workspace: WORKSPACE } as never;

function fakeSession(overrides: Partial<MobileSession> = {}): MobileSession {
  return {
    authed: vi.fn(),
    authedStream: vi.fn(),
    tryRefresh: vi.fn(async () => false),
    setSession: vi.fn(async () => {}),
    clearSession: vi.fn(async () => {}),
    hydrate: vi.fn(async () => false),
    getAccessToken: () => null,
    login: vi.fn(async () => AUTH_RESULT),
    register: vi.fn(async () => AUTH_RESULT),
    logout: vi.fn(async () => {}),
    ...overrides,
  };
}

function fakeIdentityStore(initial: Identity | null = null): IdentityStore {
  let current = initial;
  return {
    load: vi.fn(async () => current),
    save: vi.fn(async (i: Identity) => void (current = i)),
    clear: vi.fn(async () => void (current = null)),
  };
}

function fakeOnboardingFlag(seen = false): OnboardingFlag {
  let s = seen;
  return {
    wasSeen: vi.fn(async () => s),
    markSeen: vi.fn(async () => void (s = true)),
  };
}

function makeStore(over: { session?: MobileSession; identityStore?: IdentityStore; onboardingFlag?: OnboardingFlag } = {}) {
  return createAuthStore({
    session: over.session ?? fakeSession(),
    identityStore: over.identityStore ?? fakeIdentityStore(),
    onboardingFlag: over.onboardingFlag ?? fakeOnboardingFlag(),
  });
}

describe('createAuthStore', () => {
  it('starts in loading status with no user', () => {
    const store = makeStore();
    expect(store.getState().status).toBe('loading');
    expect(store.getState().user).toBeNull();
  });

  it('login persists identity and sets status authed', async () => {
    const identityStore = fakeIdentityStore();
    const store = makeStore({ identityStore });
    await store.getState().login('e@x.com', 'pw');
    expect(store.getState().status).toBe('authed');
    expect(store.getState().user).toMatchObject({ id: 'u1' });
    expect(identityStore.save).toHaveBeenCalledWith({ user: USER, workspace: WORKSPACE });
  });

  it('register persists identity and sets status authed', async () => {
    const identityStore = fakeIdentityStore();
    const store = makeStore({ identityStore });
    await store.getState().register({ displayName: 'Tee', email: 'e@x.com', password: 'pw', baseCurrency: 'USD', timezone: 'UTC' });
    expect(store.getState().status).toBe('authed');
    expect(identityStore.save).toHaveBeenCalledTimes(1);
  });

  it('logout clears identity and sets status idle', async () => {
    const identityStore = fakeIdentityStore();
    const store = makeStore({ identityStore });
    await store.getState().login('e@x.com', 'pw');
    await store.getState().logout();
    expect(store.getState().status).toBe('idle');
    expect(store.getState().user).toBeNull();
    expect(identityStore.clear).toHaveBeenCalledTimes(1);
  });

  it('hydrate with no tokens → idle, reads onboarded flag', async () => {
    const store = makeStore({
      session: fakeSession({ hydrate: vi.fn(async () => false) }),
      onboardingFlag: fakeOnboardingFlag(true),
    });
    await store.getState().hydrate();
    expect(store.getState().status).toBe('idle');
    expect(store.getState().onboarded).toBe(true);
  });

  it('hydrate with tokens + cached identity → authed', async () => {
    const identity = { user: USER, workspace: WORKSPACE } as Identity;
    const store = makeStore({
      session: fakeSession({ hydrate: vi.fn(async () => true) }),
      identityStore: fakeIdentityStore(identity),
    });
    await store.getState().hydrate();
    expect(store.getState().status).toBe('authed');
    expect(store.getState().user).toMatchObject({ id: 'u1' });
  });

  it('hydrate with tokens but no cached identity → clears session, idle', async () => {
    const clearSession = vi.fn(async () => {});
    const store = makeStore({
      session: fakeSession({ hydrate: vi.fn(async () => true), clearSession }),
      identityStore: fakeIdentityStore(null),
    });
    await store.getState().hydrate();
    expect(store.getState().status).toBe('idle');
    expect(clearSession).toHaveBeenCalledTimes(1);
  });

  it('completeOnboarding marks the flag and sets onboarded', async () => {
    const onboardingFlag = fakeOnboardingFlag(false);
    const store = makeStore({ onboardingFlag });
    await store.getState().completeOnboarding();
    expect(store.getState().onboarded).toBe(true);
    expect(onboardingFlag.markSeen).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-mobile exec vitest run src/lib/auth-store.test.ts`
Expected: FAIL — `createAuthStore` still takes a single `session` arg / no `hydrate`/`onboarded`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/mobile/src/lib/auth-store.ts
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ApiUser, ApiWorkspace, RegisterInput } from '@finby/shared';
import type { MobileSession } from './session';
import type { IdentityStore } from '../adapters/identity-store';
import type { OnboardingFlag } from '../adapters/onboarding-flag';

export interface AuthState {
  user: ApiUser | null;
  workspace: ApiWorkspace | null;
  status: 'loading' | 'idle' | 'authed';
  /** Whether the first-launch onboarding carousel has been shown. */
  onboarded: boolean;
  hydrate(): Promise<void>;
  login(email: string, password: string): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  logout(): Promise<void>;
  completeOnboarding(): Promise<void>;
}

/** Mobile auth store: identity + status, plus the cold-start restore that the
 *  root navigation gate reads. The session owns tokens (SecureStore); the
 *  identity store owns the restorable user+workspace snapshot. */
export function createAuthStore(deps: {
  session: MobileSession;
  identityStore: IdentityStore;
  onboardingFlag: OnboardingFlag;
}): StoreApi<AuthState> {
  const { session, identityStore, onboardingFlag } = deps;

  return createStore<AuthState>((set) => ({
    user: null,
    workspace: null,
    status: 'loading',
    onboarded: false,

    hydrate: async () => {
      const onboarded = await onboardingFlag.wasSeen();
      const hasTokens = await session.hydrate();
      if (!hasTokens) {
        set({ status: 'idle', onboarded });
        return;
      }
      const identity = await identityStore.load();
      if (identity) {
        set({ user: identity.user, workspace: identity.workspace, status: 'authed', onboarded });
      } else {
        // Tokens without a cached identity shouldn't normally happen; treat as
        // signed out rather than booting into an app with no user.
        await session.clearSession();
        set({ status: 'idle', onboarded });
      }
    },

    login: async (email, password) => {
      const result = await session.login(email, password);
      await identityStore.save({ user: result.user, workspace: result.workspace });
      set({ user: result.user, workspace: result.workspace, status: 'authed' });
    },

    register: async (input) => {
      const result = await session.register(input);
      await identityStore.save({ user: result.user, workspace: result.workspace });
      set({ user: result.user, workspace: result.workspace, status: 'authed' });
    },

    logout: async () => {
      await session.logout();
      await identityStore.clear();
      set({ user: null, workspace: null, status: 'idle' });
    },

    completeOnboarding: async () => {
      await onboardingFlag.markSeen();
      set({ onboarded: true });
    },
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-mobile exec vitest run src/lib/auth-store.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/auth-store.ts apps/mobile/src/lib/auth-store.test.ts
git commit -m "feat(mobile): auth store hydrate + onboarding + identity persistence (loading status)"
```

---

### Task 4: Runtime composition + `useAuthStore` hook

Wire the new adapters into the device runtime and expose the store to React.

**Files:**
- Modify: `apps/mobile/src/lib/runtime.native.ts`
- Create: `apps/mobile/src/lib/use-auth-store.ts`

**Interfaces:**
- Consumes: `createIdentityStore`, `createOnboardingFlag`, `createAuthStore`, existing `session`/`secureStore`.
- Produces: `authStore: StoreApi<AuthState>` (from `runtime.native`); `useAuthStore<T>(selector: (s: AuthState) => T): T` and re-exported `authStore` (from `use-auth-store`).

- [ ] **Step 1: Modify `runtime.native.ts`**

Add the imports and exports (keep the existing `session`/`api` exports):

```ts
import Constants from 'expo-constants';
import { resolveApiBase } from '../config';
import { createTokenStore } from '../adapters/token-store';
import { createIdentityStore } from '../adapters/identity-store';
import { createOnboardingFlag } from '../adapters/onboarding-flag';
import { secureStore } from '../adapters/secure-store.native';
import { streamFetch } from '../adapters/stream.native';
import { createMobileSession } from './session';
import { createAuthStore } from './auth-store';
import { createMobileApi } from './api';

const apiBase = resolveApiBase({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  extraApiBase: (Constants.expoConfig?.extra as { apiBase?: unknown } | undefined)?.apiBase,
});

/** App-wide session (SecureStore tokens + expo/fetch streaming) and the
 *  core-bound api. The root gate calls `authStore.getState().hydrate()` once
 *  at startup to restore a persisted login. */
export const session = createMobileSession({
  apiBase,
  tokenStore: createTokenStore(secureStore),
  fetchImpl: streamFetch,
});

export const authStore = createAuthStore({
  session,
  identityStore: createIdentityStore(secureStore),
  onboardingFlag: createOnboardingFlag(secureStore),
});

export const api = createMobileApi(session, apiBase);
```

- [ ] **Step 2: Create the React hook**

```ts
// apps/mobile/src/lib/use-auth-store.ts
import { useStore } from 'zustand';
import { authStore } from './runtime.native';
import type { AuthState } from './auth-store';

/** Subscribe a component to the app's auth store. Screens select the slices
 *  they need; the root gate selects `status`/`onboarded`. */
export function useAuthStore<T>(selector: (state: AuthState) => T): T {
  return useStore(authStore, selector);
}

export { authStore };
```

- [ ] **Step 3: Verify it typechecks and existing tests stay green**

Run: `pnpm --filter finby-mobile exec tsc --noEmit`
Expected: no errors.
Run: `pnpm --filter finby-mobile test`
Expected: all Vitest + jest suites pass (no regressions).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/lib/runtime.native.ts apps/mobile/src/lib/use-auth-store.ts
git commit -m "feat(mobile): compose authStore in runtime + useAuthStore hook"
```

---

### Task 5: Auth presentation components (header, error banner, terms gate)

Small shared pieces used by the screens.

**Files:**
- Create: `apps/mobile/src/components/auth/auth-header.tsx`
- Create: `apps/mobile/src/components/auth/error-banner.tsx`
- Create: `apps/mobile/src/components/auth/terms-gate.tsx`
- Test: `apps/mobile/src/components/auth/terms-gate.test.tsx`

**Interfaces:**
- Produces: `AuthHeader({ title: string; subtitle?: string })`; `ErrorBanner({ message: string })`; `TermsGate({ accepted: boolean; onAcceptedChange: (v: boolean) => void })`.

- [ ] **Step 1: Write the failing test (TermsGate)**

```tsx
// apps/mobile/src/components/auth/terms-gate.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { TermsGate } from './terms-gate';

describe('TermsGate', () => {
  it('toggles acceptance', async () => {
    const onAcceptedChange = jest.fn();
    await render(<TermsGate accepted={false} onAcceptedChange={onAcceptedChange} />);
    fireEvent(screen.getByLabelText('Accept terms'), 'valueChange', true);
    expect(onAcceptedChange).toHaveBeenCalledWith(true);
  });

  it('reflects the accepted prop', async () => {
    await render(<TermsGate accepted={true} onAcceptedChange={() => {}} />);
    expect(screen.getByLabelText('Accept terms').props.value).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-mobile exec jest src/components/auth/terms-gate.test.tsx`
Expected: FAIL — cannot find module `./terms-gate`.

- [ ] **Step 3: Write the implementations**

```tsx
// apps/mobile/src/components/auth/auth-header.tsx
import { Text, View } from 'react-native';

export function AuthHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View className="gap-2">
      <Text className="text-2xl font-semibold text-ink">{title}</Text>
      {subtitle ? <Text className="text-sm text-muted">{subtitle}</Text> : null}
    </View>
  );
}
```

```tsx
// apps/mobile/src/components/auth/error-banner.tsx
import { Text, View } from 'react-native';

export function ErrorBanner({ message }: { message: string }) {
  return (
    <View className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5">
      <Text className="text-sm text-danger">{message}</Text>
    </View>
  );
}
```

```tsx
// apps/mobile/src/components/auth/terms-gate.tsx
import { Linking, Text, View } from 'react-native';
import { Toggle } from '../ui/toggle';

// NOTE: confirm these URLs against apps/web/src/components/auth/terms-gate.tsx
// during review and align if web links elsewhere.
const TERMS_URL = 'https://finby.app/terms';
const PRIVACY_URL = 'https://finby.app/privacy';

export function TermsGate({
  accepted,
  onAcceptedChange,
}: {
  accepted: boolean;
  onAcceptedChange: (value: boolean) => void;
}) {
  return (
    <View className="flex-row items-center gap-3">
      <Toggle value={accepted} onValueChange={onAcceptedChange} accessibilityLabel="Accept terms" />
      <Text className="flex-1 text-sm text-muted">
        I agree to the{' '}
        <Text className="font-medium text-accent" onPress={() => Linking.openURL(TERMS_URL)}>
          Terms
        </Text>{' '}
        and{' '}
        <Text className="font-medium text-accent" onPress={() => Linking.openURL(PRIVACY_URL)}>
          Privacy Policy
        </Text>
        .
      </Text>
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-mobile exec jest src/components/auth/terms-gate.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/auth/
git commit -m "feat(mobile): auth header, error banner, terms gate components"
```

---

### Task 6: Login screen + route

**Files:**
- Create: `apps/mobile/src/screens/login-screen.tsx`
- Test: `apps/mobile/src/screens/login-screen.test.tsx`
- Create: `apps/mobile/app/(auth)/login.tsx`

**Interfaces:**
- Consumes: `useAuthStore` (`../lib/use-auth-store`), `ApiError` (`@finby/core`), primitives, `AuthHeader`/`ErrorBanner`, expo-router `Link`.
- Produces: `LoginScreen` component (named export). Navigation is NOT done in the screen — the root gate redirects when `status` becomes `'authed'`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/screens/login-screen.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const login = jest.fn();
jest.mock('../lib/use-auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector({ login }),
}));
jest.mock('expo-router', () => {
  const React = require('react');
  return { Link: ({ children }: { children: unknown }) => React.createElement(React.Fragment, null, children) };
});

import { LoginScreen } from './login-screen';

describe('LoginScreen', () => {
  beforeEach(() => login.mockReset());

  it('shows an error and does not call login when fields are empty', async () => {
    await render(<LoginScreen />);
    await fireEvent.press(screen.getByText('Sign in'));
    expect(screen.getByText('Enter your email and password.')).toBeTruthy();
    expect(login).not.toHaveBeenCalled();
  });

  it('calls login with trimmed email + password', async () => {
    login.mockResolvedValueOnce(undefined);
    await render(<LoginScreen />);
    fireEvent.changeText(screen.getByTestId('email'), '  me@x.com ');
    fireEvent.changeText(screen.getByTestId('password'), 'secret123');
    await fireEvent.press(screen.getByText('Sign in'));
    await waitFor(() => expect(login).toHaveBeenCalledWith('me@x.com', 'secret123'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-mobile exec jest src/screens/login-screen.test.tsx`
Expected: FAIL — cannot find module `./login-screen`.

- [ ] **Step 3: Write the screen**

```tsx
// apps/mobile/src/screens/login-screen.tsx
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Link } from 'expo-router';
import { ApiError } from '@finby/core';
import { ScreenContainer } from '../components/ui/screen-container';
import { Button } from '../components/ui/button';
import { Field } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { PasswordInput } from '../components/ui/password-input';
import { AuthHeader } from '../components/auth/auth-header';
import { ErrorBanner } from '../components/auth/error-banner';
import { useAuthStore } from '../lib/use-auth-store';

export function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
      // The root gate navigates to (app) when status flips to 'authed'.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
      setLoading(false);
    }
  }

  return (
    <ScreenContainer>
      <AuthHeader title="Welcome back" subtitle="Sign in to keep talking to your money." />
      {error ? <ErrorBanner message={error} /> : null}

      <Field label="Email">
        <Input
          testID="email"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          invalid={Boolean(error)}
        />
      </Field>

      <Field label="Password">
        <PasswordInput
          testID="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChangeText={setPassword}
          invalid={Boolean(error)}
        />
      </Field>

      <Link href="/forgot-password" className="text-right text-sm font-medium text-accent">
        Forgot password?
      </Link>

      <Button onPress={onSubmit} loading={loading}>
        Sign in
      </Button>

      <View className="flex-row justify-center gap-1">
        <Text className="text-sm text-muted">New here?</Text>
        <Link href="/register" className="text-sm font-medium text-accent">
          Create an account
        </Link>
      </View>
    </ScreenContainer>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-mobile exec jest src/screens/login-screen.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the route file**

```tsx
// apps/mobile/app/(auth)/login.tsx
export { LoginScreen as default } from '../../src/screens/login-screen';
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens/login-screen.tsx apps/mobile/src/screens/login-screen.test.tsx "apps/mobile/app/(auth)/login.tsx"
git commit -m "feat(mobile): login screen + (auth)/login route"
```

---

### Task 7: Register screen + timezone adapter + route

Includes installing `expo-localization` and the device-timezone adapter.

**Files:**
- Create: `apps/mobile/src/adapters/localization.native.ts`
- Create: `apps/mobile/src/screens/register-screen.tsx`
- Test: `apps/mobile/src/screens/register-screen.test.tsx`
- Create: `apps/mobile/app/(auth)/register.tsx`
- Modify: `apps/mobile/package.json` (via `expo install`)

**Interfaces:**
- Consumes: `useAuthStore`, `CURRENCIES` (`@finby/shared`), `passwordStrength` (used by `PasswordStrengthMeter`), `getDeviceTimeZone` (`../adapters/localization.native`), primitives incl. `Dropdown`, `TermsGate`.
- Produces: `RegisterScreen` (named export); `getDeviceTimeZone(): string`.

- [ ] **Step 1: Install expo-localization**

Run: `cd apps/mobile && pnpm exec expo install expo-localization && cd ../..`
Expected: `expo-localization` added to `apps/mobile/package.json` at the SDK-54-compatible version. Then from repo root: `pnpm install`.

- [ ] **Step 2: Create the timezone adapter**

```ts
// apps/mobile/src/adapters/localization.native.ts
import * as Localization from 'expo-localization';

/** Device IANA timezone (e.g. "Africa/Lagos"); falls back to UTC. */
export function getDeviceTimeZone(): string {
  return Localization.getCalendars()[0]?.timeZone ?? 'UTC';
}
```

- [ ] **Step 3: Write the failing test**

```tsx
// apps/mobile/src/screens/register-screen.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const register = jest.fn();
jest.mock('../lib/use-auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector({ register }),
}));
jest.mock('expo-router', () => {
  const React = require('react');
  return { Link: ({ children }: { children: unknown }) => React.createElement(React.Fragment, null, children) };
});
jest.mock('../adapters/localization.native', () => ({ getDeviceTimeZone: () => 'UTC' }));

import { RegisterScreen } from './register-screen';

async function fill() {
  fireEvent.changeText(screen.getByTestId('displayName'), 'Tee');
  fireEvent.changeText(screen.getByTestId('email'), '  me@x.com ');
  fireEvent.changeText(screen.getByTestId('password'), 'secret123');
}

describe('RegisterScreen', () => {
  beforeEach(() => register.mockReset());

  it('requires a display name', async () => {
    await render(<RegisterScreen />);
    fireEvent(screen.getByLabelText('Accept terms'), 'valueChange', true);
    await fireEvent.press(screen.getByText('Create account'));
    expect(screen.getByText('What should Finby call you?')).toBeTruthy();
    expect(register).not.toHaveBeenCalled();
  });

  it('rejects passwords shorter than 8 characters', async () => {
    await render(<RegisterScreen />);
    fireEvent.changeText(screen.getByTestId('displayName'), 'Tee');
    fireEvent.changeText(screen.getByTestId('email'), 'me@x.com');
    fireEvent.changeText(screen.getByTestId('password'), 'short');
    fireEvent(screen.getByLabelText('Accept terms'), 'valueChange', true);
    await fireEvent.press(screen.getByText('Create account'));
    expect(screen.getByText('Password must be at least 8 characters.')).toBeTruthy();
    expect(register).not.toHaveBeenCalled();
  });

  it('registers with the full payload (default USD currency, device timezone)', async () => {
    register.mockResolvedValueOnce(undefined);
    await render(<RegisterScreen />);
    await fill();
    fireEvent(screen.getByLabelText('Accept terms'), 'valueChange', true);
    await fireEvent.press(screen.getByText('Create account'));
    await waitFor(() =>
      expect(register).toHaveBeenCalledWith({
        displayName: 'Tee',
        email: 'me@x.com',
        password: 'secret123',
        baseCurrency: 'USD',
        timezone: 'UTC',
      }),
    );
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter finby-mobile exec jest src/screens/register-screen.test.tsx`
Expected: FAIL — cannot find module `./register-screen`.

- [ ] **Step 5: Write the screen**

```tsx
// apps/mobile/src/screens/register-screen.tsx
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Link } from 'expo-router';
import { ApiError } from '@finby/core';
import { CURRENCIES } from '@finby/shared';
import { ScreenContainer } from '../components/ui/screen-container';
import { Button } from '../components/ui/button';
import { Field } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { PasswordInput } from '../components/ui/password-input';
import { PasswordStrengthMeter } from '../components/ui/password-strength-meter';
import { Dropdown } from '../components/ui/dropdown';
import { AuthHeader } from '../components/auth/auth-header';
import { ErrorBanner } from '../components/auth/error-banner';
import { TermsGate } from '../components/auth/terms-gate';
import { useAuthStore } from '../lib/use-auth-store';
import { getDeviceTimeZone } from '../adapters/localization.native';

const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }));

export function RegisterScreen() {
  const register = useAuthStore((s) => s.register);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [timezone] = useState(getDeviceTimeZone);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError(null);
    if (!displayName.trim()) {
      setError('What should Finby call you?');
      return;
    }
    if (!email.trim()) {
      setError('Enter your email.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!acceptedTerms) {
      setError('Please read and accept the Terms to continue.');
      return;
    }
    setLoading(true);
    try {
      await register({
        displayName: displayName.trim(),
        email: email.trim(),
        password,
        baseCurrency,
        timezone,
      });
      // The root gate navigates to (app) on success.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
      setLoading(false);
    }
  }

  return (
    <ScreenContainer>
      <AuthHeader title="Create your account" subtitle="Start logging expenses just by chatting." />
      {error ? <ErrorBanner message={error} /> : null}

      <Field label="Name">
        <Input testID="displayName" autoComplete="name" placeholder="Alex" value={displayName} onChangeText={setDisplayName} />
      </Field>

      <Field label="Email">
        <Input
          testID="email"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
        />
      </Field>

      <Field label="Password" hint="At least 8 characters.">
        <PasswordInput testID="password" autoComplete="new-password" placeholder="••••••••" value={password} onChangeText={setPassword} />
        <PasswordStrengthMeter value={password} />
      </Field>

      <Field label="Base currency" hint={`Timezone detected: ${timezone}`}>
        <Dropdown value={baseCurrency} options={CURRENCY_OPTIONS} onSelect={setBaseCurrency} accessibilityLabel="Base currency" />
      </Field>

      <TermsGate accepted={acceptedTerms} onAcceptedChange={setAcceptedTerms} />

      <Button onPress={onSubmit} loading={loading} disabled={!acceptedTerms}>
        Create account
      </Button>

      <View className="flex-row justify-center gap-1">
        <Text className="text-sm text-muted">Already have an account?</Text>
        <Link href="/login" className="text-sm font-medium text-accent">
          Sign in
        </Link>
      </View>
    </ScreenContainer>
  );
}
```

> If `PasswordStrengthMeter` is exported under a different name or its prop is not `value`, open `apps/mobile/src/components/ui/password-strength-meter.tsx` and match its actual export/prop. Do not change the primitive.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter finby-mobile exec jest src/screens/register-screen.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 7: Add the route file**

```tsx
// apps/mobile/app/(auth)/register.tsx
export { RegisterScreen as default } from '../../src/screens/register-screen';
```

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/screens/register-screen.tsx apps/mobile/src/screens/register-screen.test.tsx apps/mobile/src/adapters/localization.native.ts "apps/mobile/app/(auth)/register.tsx" apps/mobile/package.json ../../pnpm-lock.yaml
git commit -m "feat(mobile): register screen + device-timezone adapter + (auth)/register route"
```

> If `pnpm-lock.yaml` path differs, `git add` the repo-root lockfile that `expo install` + `pnpm install` changed.

---

### Task 8: Forgot-password screen + route

**Files:**
- Create: `apps/mobile/src/screens/forgot-password-screen.tsx`
- Test: `apps/mobile/src/screens/forgot-password-screen.test.tsx`
- Create: `apps/mobile/app/(auth)/forgot-password.tsx`

**Interfaces:**
- Consumes: `api` (`../lib/runtime.native`) → `api.auth.forgotPassword(email)`, primitives, `AuthHeader`, expo-router `Link`.
- Produces: `ForgotPasswordScreen` (named export).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/screens/forgot-password-screen.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const forgotPassword = jest.fn();
jest.mock('../lib/runtime.native', () => ({ api: { auth: { forgotPassword } } }));
jest.mock('expo-router', () => {
  const React = require('react');
  return { Link: ({ children }: { children: unknown }) => React.createElement(React.Fragment, null, children) };
});

import { ForgotPasswordScreen } from './forgot-password-screen';

describe('ForgotPasswordScreen', () => {
  beforeEach(() => forgotPassword.mockReset());

  it('submits the trimmed email and shows the generic confirmation', async () => {
    forgotPassword.mockResolvedValueOnce({ message: 'ok' });
    await render(<ForgotPasswordScreen />);
    fireEvent.changeText(screen.getByTestId('fp-email'), '  me@x.com ');
    await fireEvent.press(screen.getByText('Send reset link'));
    await waitFor(() => expect(forgotPassword).toHaveBeenCalledWith('me@x.com'));
    expect(screen.getByText(/reset link is on its way/i)).toBeTruthy();
  });

  it('still shows the confirmation when the request fails', async () => {
    forgotPassword.mockRejectedValueOnce(new Error('network'));
    await render(<ForgotPasswordScreen />);
    fireEvent.changeText(screen.getByTestId('fp-email'), 'me@x.com');
    await fireEvent.press(screen.getByText('Send reset link'));
    await waitFor(() => expect(screen.getByText(/reset link is on its way/i)).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-mobile exec jest src/screens/forgot-password-screen.test.tsx`
Expected: FAIL — cannot find module `./forgot-password-screen`.

- [ ] **Step 3: Write the screen**

```tsx
// apps/mobile/src/screens/forgot-password-screen.tsx
import { useState } from 'react';
import { Text } from 'react-native';
import { Link } from 'expo-router';
import { ScreenContainer } from '../components/ui/screen-container';
import { Button } from '../components/ui/button';
import { Field } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { AuthHeader } from '../components/auth/auth-header';
import { api } from '../lib/runtime.native';

export function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setLoading(true);
    try {
      await api.auth.forgotPassword(email.trim());
    } catch {
      /* generic response shown regardless — never reveal whether the email exists */
    }
    setSent(true);
    setLoading(false);
  }

  return (
    <ScreenContainer>
      <AuthHeader title="Reset your password" subtitle="We'll email you a link to choose a new one." />
      {sent ? (
        <Text className="text-sm text-muted">
          If an account exists for {email.trim()}, a reset link is on its way.
        </Text>
      ) : (
        <>
          <Field label="Email">
            <Input
              testID="fp-email"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
            />
          </Field>
          <Button onPress={onSubmit} loading={loading}>
            Send reset link
          </Button>
        </>
      )}
      <Link href="/login" className="text-center text-sm font-medium text-accent">
        Back to sign in
      </Link>
    </ScreenContainer>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-mobile exec jest src/screens/forgot-password-screen.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the route file**

```tsx
// apps/mobile/app/(auth)/forgot-password.tsx
export { ForgotPasswordScreen as default } from '../../src/screens/forgot-password-screen';
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens/forgot-password-screen.tsx apps/mobile/src/screens/forgot-password-screen.test.tsx "apps/mobile/app/(auth)/forgot-password.tsx"
git commit -m "feat(mobile): forgot-password screen + (auth)/forgot-password route"
```

---

### Task 9: Onboarding carousel screen + route

3-slide first-launch intro; finishing calls `completeOnboarding()` (the gate then routes to login).

**Files:**
- Create: `apps/mobile/src/screens/onboarding-screen.tsx`
- Test: `apps/mobile/src/screens/onboarding-screen.test.tsx`
- Create: `apps/mobile/app/(auth)/onboarding.tsx`

**Interfaces:**
- Consumes: `useAuthStore` → `completeOnboarding`, `ScreenContainer`, `Button`.
- Produces: `OnboardingScreen` (named export).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/screens/onboarding-screen.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';

const completeOnboarding = jest.fn();
jest.mock('../lib/use-auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector({ completeOnboarding }),
}));

import { OnboardingScreen } from './onboarding-screen';

describe('OnboardingScreen', () => {
  beforeEach(() => completeOnboarding.mockReset());

  it('shows the first slide and a Next button', async () => {
    await render(<OnboardingScreen />);
    expect(screen.getByText('Track money by chatting')).toBeTruthy();
    expect(screen.getByText('Next')).toBeTruthy();
  });

  it('advances through slides and finishes on the last', async () => {
    await render(<OnboardingScreen />);
    await fireEvent.press(screen.getByText('Next')); // slide 2
    await fireEvent.press(screen.getByText('Next')); // slide 3
    expect(screen.getByText('Get started')).toBeTruthy();
    await fireEvent.press(screen.getByText('Get started'));
    expect(completeOnboarding).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-mobile exec jest src/screens/onboarding-screen.test.tsx`
Expected: FAIL — cannot find module `./onboarding-screen`.

- [ ] **Step 3: Write the screen**

```tsx
// apps/mobile/src/screens/onboarding-screen.tsx
import { useState } from 'react';
import { Text, View } from 'react-native';
import { ScreenContainer } from '../components/ui/screen-container';
import { Button } from '../components/ui/button';
import { useAuthStore } from '../lib/use-auth-store';

const SLIDES = [
  { title: 'Track money by chatting', body: 'Log expenses, income, and transfers just by talking to Finby — no forms, no spreadsheets.' },
  { title: 'Budgets that nudge you', body: 'Set budgets and get honest heads-ups at 75%, 90%, and 100% — before you overspend.' },
  { title: 'See where it goes', body: 'A glanceable dashboard and your full history, always one tap from the chat.' },
];

export function OnboardingScreen() {
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;
  const slide = SLIDES[index]!;

  function next() {
    if (last) void completeOnboarding();
    else setIndex((i) => i + 1);
  }

  return (
    <ScreenContainer>
      <View className="gap-3">
        <Text className="text-2xl font-semibold text-ink">{slide.title}</Text>
        <Text className="text-base text-muted">{slide.body}</Text>
      </View>

      <View className="flex-row justify-center gap-2">
        {SLIDES.map((s, i) => (
          <View key={s.title} testID={`dot-${i}`} className={`h-2 w-2 rounded-full ${i === index ? 'bg-accent' : 'bg-line'}`} />
        ))}
      </View>

      <Button onPress={next}>{last ? 'Get started' : 'Next'}</Button>
    </ScreenContainer>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-mobile exec jest src/screens/onboarding-screen.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the route file**

```tsx
// apps/mobile/app/(auth)/onboarding.tsx
export { OnboardingScreen as default } from '../../src/screens/onboarding-screen';
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens/onboarding-screen.tsx apps/mobile/src/screens/onboarding-screen.test.tsx "apps/mobile/app/(auth)/onboarding.tsx"
git commit -m "feat(mobile): onboarding carousel screen + (auth)/onboarding route"
```

---

### Task 10: Navigation gate + route groups + app home

Tie it together: expo-router `(auth)`/`(app)` group layouts, the `(app)` home placeholder, the splash, and the root gate that hydrates on mount and redirects by `status`/`onboarded`.

**Files:**
- Create: `apps/mobile/app/(auth)/_layout.tsx`
- Create: `apps/mobile/app/(app)/_layout.tsx`
- Create: `apps/mobile/app/(app)/index.tsx`
- Modify: `apps/mobile/app/index.tsx` (→ splash)
- Modify: `apps/mobile/app/_layout.tsx` (→ root gate + SafeAreaProvider)

> No unit test — this layer is expo-router/native integration, verified by the bundle export (Task 11) and the device smoke pass. Store transitions it depends on are already covered in Task 3.

- [ ] **Step 1: Group layouts**

```tsx
// apps/mobile/app/(auth)/_layout.tsx
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

```tsx
// apps/mobile/app/(app)/_layout.tsx
import { Stack } from 'expo-router';

export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 2: App home placeholder (exercises logout)**

```tsx
// apps/mobile/app/(app)/index.tsx
import { Text, View } from 'react-native';
import { Button } from '../../src/components/ui/button';
import { useAuthStore } from '../../src/lib/use-auth-store';

export default function Home() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-canvas px-6">
      <Text className="text-2xl font-semibold text-ink">Finby</Text>
      {user ? <Text className="text-muted">Signed in as {user.displayName}</Text> : null}
      <Button variant="ghost" onPress={() => void logout()}>
        Log out
      </Button>
    </View>
  );
}
```

- [ ] **Step 3: Splash index**

```tsx
// apps/mobile/app/index.tsx
import { View } from 'react-native';

/** Neutral splash. The root gate redirects away once hydrate() resolves. */
export default function Index() {
  return <View className="flex-1 bg-canvas" />;
}
```

- [ ] **Step 4: Root gate**

```tsx
// apps/mobile/app/_layout.tsx
import '../global.css';
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { authStore, useAuthStore } from '../src/lib/use-auth-store';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthGate />
    </SafeAreaProvider>
  );
}

function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const status = useAuthStore((s) => s.status);
  const onboarded = useAuthStore((s) => s.onboarded);

  // Restore a persisted session once on mount.
  useEffect(() => {
    void authStore.getState().hydrate();
  }, []);

  useEffect(() => {
    if (status === 'loading') return;
    const inAuthGroup = segments[0] === '(auth)';
    const onOnboarding = segments[1] === 'onboarding';

    if (status === 'authed') {
      if (inAuthGroup) router.replace('/(app)');
      return;
    }
    // Signed out:
    if (!onboarded) {
      if (!onOnboarding) router.replace('/(auth)/onboarding');
    } else if (!inAuthGroup) {
      router.replace('/(auth)/login');
    }
  }, [status, onboarded, segments, router]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 5: Verify the JS bundle builds (no device)**

Run: `pnpm --filter finby-mobile exec expo export:embed --platform ios --dev false --bundle-output /tmp/finby-phase3b2a.js`
Expected: completes without resolution/registration errors; `/tmp/finby-phase3b2a.js` is written.

Run (sanity — no SharedArrayBuffer regressions):
`grep -c "SharedArrayBuffer.prototype" /tmp/finby-phase3b2a.js || true`
Expected: `0`.

- [ ] **Step 6: Commit**

```bash
git add "apps/mobile/app/(auth)/_layout.tsx" "apps/mobile/app/(app)/_layout.tsx" "apps/mobile/app/(app)/index.tsx" apps/mobile/app/index.tsx apps/mobile/app/_layout.tsx
git commit -m "feat(mobile): (auth)/(app) route groups + root navigation gate with session restore"
```

---

### Task 11: Full gate, memory update, finish branch

**Files:**
- Modify: `/home/unicorn/.claude-personal/projects/-home-unicorn-Documents-finby/memory/mobile-app-architecture.md` (append Phase 3b-2a status) and `MEMORY.md` if a new pointer is warranted.

- [ ] **Step 1: Run the whole mobile suite**

Run: `pnpm --filter finby-mobile test`
Expected: Vitest (existing logic incl. the new adapter + auth-store tests) and jest (existing primitives + new screen/component tests) all pass.

- [ ] **Step 2: Typecheck + lint + dependent builds**

Run: `pnpm --filter finby-mobile exec tsc --noEmit`
Expected: no errors.
Run: `pnpm lint`
Expected: 0 errors (the pre-existing `apps/web/public/sw.js` `_e` warning is acceptable).
Run: `pnpm --filter @finby/shared build && pnpm --filter @finby/core build && pnpm --filter finby-web test`
Expected: builds succeed; web 295 tests still pass (we did not touch web).

- [ ] **Step 3: Update the auto-memory**

Append a `3b-2a) ✅ DONE` entry to `mobile-app-architecture.md` summarizing: identity-store + onboarding-flag adapters; auth-store gained `loading` status + `hydrate`/`completeOnboarding` + identity persistence; `useAuthStore` hook; auth components (header/error-banner/terms-gate); Login/Register/Onboarding(carousel)/Forgot screens in `src/screens/` with thin `app/(auth)/*` re-export routes; `(auth)`/`(app)` groups + root gate (hydrate-on-mount, redirect by status/onboarded) + SafeAreaProvider; `expo-localization` added for device timezone. Record the **decisions**: onboarding = web-style first-launch carousel (currency stays in Register + terms gate); identity restore = persist user+workspace locally (not `/auth/me`+`/auth/workspaces`, which are lossy). Note **deferred to 3b-2b**: biometric lock. Note device smoke pass still pending (run the app in Expo Go: `pnpm --filter finby-mobile start`).

- [ ] **Step 4: Device smoke pass (manual, with the user)**

Run the app and verify: first launch → onboarding carousel → login; register a new account → lands in `(app)` home; kill & relaunch → restored straight to `(app)` (session restore); log out → back to login. (`expo-localization` and all screens run in Expo Go.)

- [ ] **Step 5: Finalize**

Use the **superpowers:finishing-a-development-branch** skill to merge/clean up per the user's preference. Confirm the whole-branch review (opus) before merging to `main`, per the established workflow. Do not push unless the user asks.

---

## Self-Review

**Spec coverage** (against the Phase-3 design + the two locked decisions):
- Login / Register / Forgot screens → Tasks 6, 7, 8. ✓
- Onboarding (decided = web carousel, not currency setup) → Task 9. ✓
- Native primitives → already shipped in Phase 3b-1; reused, not rebuilt. ✓ (PasswordStrengthMeter export/prop verified in Task 7.)
- `(auth)`/`(app)` groups + nav gate → Task 10. ✓
- Cold-start session restore (`hydrate` + identity persistence) → Tasks 1, 3, 10. ✓
- Terms gate (legal parity) → Task 5 + Task 7. ✓
- Biometric → **explicitly out of scope** (Phase 3b-2b), per the locked "split" decision. ✓ (Design's biometric section intentionally deferred.)

**Placeholder scan:** No `TODO`/`TBD`/"handle errors" placeholders. The only soft references are explicit verify-against-source notes (Terms URLs vs web; `PasswordStrengthMeter` export name) with working defaults in code — acceptable, not blockers.

**Type consistency:** `createAuthStore` deps `{ session, identityStore, onboardingFlag }` consistent across Tasks 3/4/test. `Identity = { user, workspace }` consistent across identity-store (1), auth-store (3), and its persistence calls. `Dropdown` uses `onSelect` (not `onChange`) per the real primitive. `AuthResult.user/workspace` are `ApiUser`/`ApiWorkspace` — matches what's persisted and set. Store `status` union `'loading'|'idle'|'authed'` used identically in gate (10) and tests (3).

**Risks flagged:**
- The gate is integration-tested on device only (store transitions are unit-tested). Acceptable; the redirect logic is small and the bundle export catches wiring errors.
- `expo install expo-localization` must resolve an SDK-54-compatible version (run from `apps/mobile`, then root `pnpm install`); if `expo install --check` flags drift, align per the Phase-2 lesson.
- `<Link className>` relies on NativeWind processing expo-router's `Link`; if styling doesn't apply on device, swap to `<Link asChild>` wrapping a styled `<Text>` (cosmetic; doesn't affect tests, which mock `Link`).

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-24-mobile-phase3b2a-auth-screens-nav.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
