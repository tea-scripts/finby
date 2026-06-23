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
