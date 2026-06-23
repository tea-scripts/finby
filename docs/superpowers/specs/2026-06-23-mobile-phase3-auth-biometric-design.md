# Mobile Phase 3 — Auth + Secure Storage + Biometric — Design

**Date:** 2026-06-23
**Status:** Approved (design); pending implementation plan
**Builds on:** Phase 1 (`@finby/core` kernel), Phase 1b (API factories + DTOs in shared), Phase 2 (Expo app + `createMobileSession` + SecureStore/analytics/stream adapters).

## Goal

Give the native app a working authenticated entry: login/register/onboarding/forgot-password screens, native UI primitives, biometric app-lock — by **extracting the auth flow into `@finby/core`** so web and mobile share one implementation, and reusing the Phase-2 session/adapters.

## Scope (v1 of Phase 3)

- Screens (expo-router `(auth)/`): **Login, Register, Onboarding, Forgot-Password**.
- Native UI primitives: `Button`, `Input`, `PasswordInput` (+ password-strength meter), `Field`, `ScreenContainer`, `Dropdown` (bottom-sheet picker).
- Shared `createAuthSession` in `@finby/core`; **web Zustand store refactored onto it**; mobile auth store built on it.
- Biometric app-lock (`expo-local-authentication`) gating `(app)`: lock on cold start AND resume-from-background; default on after first login; OS passcode fallback; enable/disable in store (+ a Toggle primitive).

## Non-Goals (deferred)

- **Reset-Password + Verify-Email** screens — reached via emailed deep links; need universal/app-link setup. Deferred to a deep-linking phase.
- **Invite-accept** screen — family feature; later.
- Settings screen UI — later phase (Phase 3 ships the lock store/state + Toggle primitive, not a full settings screen).
- Real feature screens (dashboard/chat/etc.) — Phase 5.

## Architecture

### Shared auth flow in `@finby/core`

Today login/register/logout live inline in `apps/web/src/lib/store.ts`. Extract into `@finby/core`:

`createAuthSession(config)` where config injects:
- `http: HttpClient` (from `createHttpClient`)
- `tokenStore: { load(); save(pair); clear() }` — web: a localStorage-backed adapter; mobile: the Phase-2 SecureStore `TokenStore`.
- `analytics: { identifyUser(id, tier); track(event, props?); resetAnalytics() }` — web: posthog-js wrappers; mobile: the Phase-2 analytics adapter.
- optional `fetchImpl` (mobile passes `expo/fetch` for streaming, per Phase 1).

Returns an object exposing:
- `login(email, password): Promise<AuthResult>` — POST `/auth/login`; on success persist the token pair via `tokenStore.save`, hold tokens in memory (sync getters for the authed client), call `analytics.identifyUser` + `track('signed_up'?)`; return `AuthResult` (user + workspace).
- `register(input: RegisterInput): Promise<AuthResult>` — POST `/auth/register`; same persistence + `analytics.track('signed_up', { method: 'password' })`.
- `logout(): Promise<void>` — best-effort POST `/auth/logout` (revoke), clear tokens via `tokenStore.clear`, `analytics.resetAnalytics`.
- `tryRefresh()`, `authed`, `authedStream` — from the Phase-1 `createAuthedClient` (single-sourced refresh/streaming).
- `hydrate(): Promise<TokenPair | null>` — load persisted tokens into memory at startup.
- `getAccessToken()`.

This **folds in Phase-2's `createMobileSession`** (which becomes a thin `createAuthSession` call with the SecureStore tokenStore + analytics adapter + `expo/fetch`). The mobile `createMobileApi` (Phase 2) continues to bind the core API factories to `session.authed`/`authedStream`.

The **web store refactors** to call `createAuthSession` (with a localStorage tokenStore adapter + posthog analytics wrappers) instead of its inline login/register/logout — keeping its existing `AuthState` public surface so web consumers/tests are unchanged.

Core stays platform-agnostic (ESLint guard): no localStorage/window/expo imports; everything injected.

### Mobile state + navigation

- A mobile Zustand auth store wraps `createAuthSession` and holds `user: ApiUser | null`, `workspace: ApiWorkspace | null`, `status: 'loading' | 'idle' | 'authed'`, plus biometric lock state (`lockEnabled: boolean`, `locked: boolean`). Actions: `login`, `register`, `logout`, `hydrate`, `unlock`, `setLockEnabled`.
- **Navigation (expo-router groups):** `(auth)/` (login, register, onboarding, forgot-password) and `(app)/` (Phase-2 placeholder for now). A root layout gate:
  - On launch: `hydrate()`. If no session → `(auth)/login`. If session + onboarding incomplete → `(auth)/onboarding`. Else → `(app)`.
  - If session + `lockEnabled` → render `BiometricGate` over `(app)`.

### Native UI primitives

Built test-first (RNTL), NativeWind + Phase-2 tokens, mirroring web component contracts:
- `Button` — variants (primary/secondary/ghost), loading/disabled states.
- `Input` — controlled text input with native keyboard types.
- `PasswordInput` — secure entry with show/hide toggle.
- `password-strength` — meter reusing web's strength logic (port `password-strength.ts`; if shareable, move to `@finby/shared`).
- `Field` — label + helper/error text wrapper.
- `ScreenContainer` — safe-area + keyboard-avoiding scroll wrapper.
- `Dropdown` — accessible bottom-sheet single-select (for onboarding base-currency); no native `<select>` (mirrors the web hard-rule intent).
- `Toggle` — switch primitive (for the biometric lock setting).

### Screens (`(auth)/`)

- **Login** — email + password → `authStore.login()` → route by onboarding state.
- **Register** — displayName, email, password (+ strength) → `authStore.register()` → onboarding.
- **Onboarding** — base currency (Dropdown, from `@finby/shared` `CURRENCIES`) + timezone (device default via `expo-localization` or RN) → `settings.updateProfile`/currency call → `(app)`.
- **Forgot-Password** — email → core `auth.forgotPassword()` (Phase 1b) → confirmation message.

Validation + errors reuse `@finby/shared` rules and the `ApiError` shape from core.

### Biometric lock

- `expo-local-authentication` behind a decoupled adapter: `createBiometric(localAuth)` returning `{ isAvailable(): Promise<boolean>; authenticate(): Promise<boolean> }`; logic testable with a fake, native call in `biometric.native.ts`.
- `BiometricGate` component wraps `(app)`: when `status === 'authed' && lockEnabled`, requires biometric auth on cold start and on `AppState` change to `active` from background. Failure/cancel keeps `locked = true` (no app content rendered). OS passcode is the system fallback.
- Default `lockEnabled = true` after first successful login; a Toggle (in store now; surfaced in a Settings screen later) flips it.

## Testing

- `createAuthSession` — unit-tested in `@finby/core` (mock `http`, fake `tokenStore`, spy `analytics`): login/register persist + return AuthResult; logout clears; hydrate loads; authed/refresh delegate.
- Web store refactor — existing web tests stay green (public `AuthState` unchanged).
- Mobile — set up **@testing-library/react-native + react-test-renderer** (runs in node on Linux, no simulator): primitives render/behave; screens call the right store actions and show errors; auth store transitions; `BiometricGate` locks/unlocks via a stubbed biometric adapter.
- Device smoke pass for the real biometric prompt and resume-lock.

## Open Risks / Follow-ups

- **Biometric on-device validation:** `expo-local-authentication` works in Expo Go, but resume-from-background lock behavior is best validated in a **dev build**; flag for the device pass. (Dev build also needed later for posthog/animations.)
- **password-strength sharing:** prefer moving the pure strength logic to `@finby/shared` so web + mobile share it; if web's couples to DOM, keep a ported copy in mobile.
- **timezone source:** use `expo-localization` for device timezone (add via `expo install`).
- **Onboarding "complete" signal:** determine from `user`/`workspace` state (e.g. base currency set) — confirm the exact field during planning by reading the web onboarding page.

## Sequencing (each step shippable)

1. Extract `createAuthSession` in core; refactor web store onto it (web green).
2. Refactor mobile session/auth store onto `createAuthSession`; `createMobileApi` unchanged.
3. Set up RNTL; build native primitives (Button/Input/PasswordInput/Field/ScreenContainer/Dropdown/Toggle).
4. Login + Register screens + navigation gate.
5. Onboarding + Forgot-Password screens.
6. Biometric adapter + `BiometricGate` + lock state/Toggle.
