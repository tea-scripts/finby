# Finby Native Mobile App — Design

**Date:** 2026-06-23
**Status:** Approved (design); pending implementation plan
**Decision driver:** Ship a truly native iOS + Android app (App Store + Play Store), full
feature parity with the web app, with proper runway (developer accounts only so far — no
binary submitted yet).

## Goals

- A genuinely native mobile experience (native UI/UX and performance), not a webview wrapper.
- Full feature parity with the web app at v1: auth, onboarding, chat, dashboard,
  transactions, streaks/gamification, settings, billing.
- Native capabilities: biometric unlock, native push, haptics & polish.
- Single source of truth for business logic shared between web and mobile (no drift).

## Non-Goals (v1)

- Offline support / local caching + sync (explicitly deferred — largest effort).
- Bare React Native / custom native modules beyond what Expo config plugins cover.

## Chosen Approach

**Approach A — Expo (managed workflow) + extracted shared core.**

A new `apps/mobile` Expo app (expo-router, EAS Build/Submit) consuming a new
framework-agnostic `@finby/core` package that holds the portable business logic currently
in `apps/web/src/lib`. Both web and mobile depend on `@finby/core` through thin
platform adapters. UI is rebuilt natively.

Rejected alternatives:
- **B (Expo + copy/adapt `lib` into mobile):** faster start, but two diverging copies of
  every API client/store — every change/bug done twice. Bad fit since web + mobile coexist.
- **C (bare React Native):** unnecessary native build/maintenance overhead; no need for
  custom native modules Expo can't cover.

## Context (current state)

- Web app is a heavily client-rendered SPA: ~73 `"use client"` files, **no** server-component
  data fetching, **no** `cookies()`/`next/headers` coupling.
- Auth is **bearer tokens in `localStorage`** (Zustand persist) hitting the NestJS API
  directly via `fetch`. No SSR/cookie dependency — ideal for mobile.
- Existing PWA manifest, install prompt, and web-push are already wired.
- `@finby/shared` (types, constants, announcements, admin-metrics) is pure TS — reusable
  in RN as-is.
- `apps/web/src/lib` holds rich `*-api.ts` clients (auth, chat, dashboard, transactions,
  streaks, billing, settings, accounts, alerts, announcements, feedback, members, receipts,
  support), Zustand stores, `sse.ts` (chat streaming), and formatters.

## Architecture

```
apps/
  api/                  # NestJS (unchanged)
  web/                  # Next.js — consumes @finby/core; lib/ slims to adapter wiring
  admin/                # unchanged
  mobile/               # NEW — Expo (expo-router, EAS, NativeWind)
packages/
  shared/               # existing pure-TS types/constants (unchanged role)
  core/                 # NEW — framework-agnostic business logic + adapter interfaces
```

`@finby/core` depends only on injected adapters — never on `localStorage`, `window`,
`next/*`, or React Native APIs directly.

## Code-Sharing via Platform Adapters

The core exposes a small adapter interface each app implements:

| Concern        | Web                       | Mobile                                  |
|----------------|---------------------------|-----------------------------------------|
| Token storage  | `localStorage`            | `expo-secure-store` (Keychain/Keystore) |
| API base URL   | `NEXT_PUBLIC_*` env       | Expo config / env                       |
| SSE / streaming| native `EventSource`/fetch| `react-native-sse` or `expo/fetch` stream |
| Analytics      | `posthog-js`              | `posthog-react-native`                  |

API clients are refactored to receive an injected `authedFetch` (bearer + 401-refresh)
instead of reaching into a Zustand singleton. **Extraction is incremental and test-first** —
each module moved to `@finby/core` keeps the web app green before the next is touched.
Web `lib/` shrinks to adapter wiring + web-only bits (install-prompt, etc.).

## UI / Design System

- Rebuild the component library with RN primitives, preserving the design language via a
  shared design-tokens module (spacing, color, typography).
- Core primitives first, mirroring the web custom-component contract so feature code ports
  cleanly: `Input`, `Dropdown` (native picker/bottom-sheet), `DatePicker`, `Toggle`,
  `Button`, sheets, toasts.
- Styling via **NativeWind** (Tailwind for RN) so existing Tailwind tokens/classes carry over.
- Screens via expo-router, matching the web route map.
- Built test-first (RNTL) mirroring existing `*.test.tsx` discipline.

## Chat & SSE Streaming

- Move SSE parsing into `@finby/core` behind a `StreamTransport` adapter.
- Web keeps current transport; mobile implements with `react-native-sse` (or `expo/fetch`
  streaming via `ReadableStream`).
- Native streaming/typewriter UI driven by the same core event stream — partial tokens,
  tool/action cards, and error handling stay identical to web.

## Auth, Secure Storage & Biometric Unlock

- Tokens move from `localStorage` to **`expo-secure-store`** via the storage adapter.
- **Biometric app-lock** with `expo-local-authentication`: Face ID / Touch ID / fingerprint
  gate on cold start and resume-from-background, passcode fallback, toggle in settings.
- Existing 401-refresh flow reused unchanged; only persistence differs.

## Native Push

- `expo-notifications` for APNs (iOS) + FCM (Android); device token registered against a
  new/extended backend endpoint (model after existing web-push plumbing).
- Covers streak reminders, alerts, announcements. Native pre-prompt before the system
  permission dialog for opt-in rate.
- Notification deep links route to the right screen via expo-router.

## Haptics & Polish

- `expo-haptics` on key interactions (send message, complete action, streak milestone).
- Native splash screen, adaptive app icons, smooth transitions, pull-to-refresh.
- These details also matter for clearing App Store Review Guideline 4.2 (must feel native,
  not a wrapper).

## Build & Release Pipeline

- **EAS Build** for cloud iOS/Android builds (no local Xcode/Android Studio required).
- **EAS Submit** to App Store Connect & Play Console.
- Bundle identifiers, icons, splash, and store metadata set against the new accounts.
- Internal distribution (TestFlight / Play internal testing) before public submission.
- `@sentry/react-native` wired in (Sentry already in the stack).

## Testing

- Core logic unit-tested in `@finby/core` (Vitest, reusing existing tests as they move).
- Native components test-first with React Native Testing Library.
- Real-device smoke pass via TestFlight / Play internal testing before submission.

## Sequencing (each phase shippable/reviewable)

1. Extract `@finby/core` incrementally; web stays green throughout.
2. Scaffold Expo app + adapters + design tokens + primitives.
3. Auth + secure storage + biometric.
4. Chat (+ SSE transport).
5. Dashboard, transactions, streaks, settings, billing.
6. Native push + haptics + polish.
7. EAS build → internal testing → store submission.

## Open Risks / Follow-ups

- **In-app billing & Apple IAP:** If subscriptions are sold inside the app, Apple generally
  requires StoreKit IAP rather than Stripe. Confirm how billing is presented when the
  billing phase is reached; may require StoreKit integration or restructuring the in-app
  purchase flow. (Play Store has analogous Google Play Billing rules.)
- **App Store Review 4.2 (minimum functionality):** mitigated by genuine native UI + native
  capabilities (biometrics, push, haptics), but worth a pre-submission self-audit.
- **SSE on RN:** validate the chosen streaming transport (`react-native-sse` vs
  `expo/fetch`) early in the chat phase, as it's the highest-uncertainty technical item.
