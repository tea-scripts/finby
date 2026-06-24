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
eas init                   # one-time: links the Expo project (writes extra.eas.projectId to app.json)
eas build --profile development --platform ios      # or android
eas build --profile production --platform all
eas submit --profile production --platform ios       # App Store Connect
eas submit --profile production --platform android    # Play Console
```

### Development build (required to test biometrics, push, analytics, animations)

Expo Go can't test everything (no `posthog-react-native`, no reanimated, and biometrics/
resume-lock + `app.json` `infoPlist`/`NSFaceIDUsageDescription` only apply in a real build).
A **dev build** (built with `expo-dev-client`, already a dependency) replaces Expo Go and
loads JS from your Metro server just like Expo Go does.

**Two ways to build it:**

```bash
# A) iOS Simulator build — NO Apple Developer account needed. Best for verifying
#    biometrics fast: the Simulator simulates Face ID.
eas build --profile development-simulator --platform ios
#    → download the .app, drag it onto a booted Simulator (or `eas build:run -p ios`)

# B) Physical-device build — needs an Apple account + the device registered with EAS
#    (EAS will walk you through credentials / UDID registration).
eas build --profile development --platform ios
```

Then run the JS for either build:

```bash
npx expo start --dev-client   # open the installed "Finby (dev)" app, not Expo Go
```

**Verifying biometrics in the iOS Simulator:** boot the Simulator, then
`Features → Face ID → Enrolled`. Launch the dev build while logged in → it should prompt
Face ID. Use `Features → Face ID → Matching Face` to pass / `Non-matching Face` to fail.
Background the app (`Cmd+Shift+H`) and reopen to confirm the resume re-lock.

## Architecture note

`src/lib/session.ts` builds `@finby/core`'s http + authed client with
SecureStore-backed tokens and `expo/fetch` for streaming; `src/lib/api.ts`
binds every `createXxxApi` factory to that session. Web and mobile therefore
share one API/business-logic implementation — only the injected adapters differ.
