# Mobile PWA — Native-Feel Design

**Date:** 2026-06-05
**Scope:** `apps/web` only. No backend, no new dependencies.
**Status:** Approved (design), pending implementation plan.

## Problem

Finby is live at `chat.finby.app` and already ships a `display: standalone` web
manifest, but tested in mobile Safari it feels like a web page, not an app:

1. **Inputs zoom on focus.** The chat `textarea` and the auth `Input` use
   `text-sm` (14px). iOS Safari auto-zooms any focused input under 16px.
2. **Bottom nav collides with Safari's toolbar.** The app shell uses `h-screen`
   (`100vh`), which on iOS includes the area behind the browser chrome, so the
   mobile tab-bar renders underneath Safari's bottom toolbar.
3. **No "installed app" affordance.** The manifest makes Finby installable, but
   users don't discover "Add to Home Screen," and there is no safe-area handling
   for the notch / home-indicator when launched standalone.

## Goals

- Stop input zoom on iOS without disabling pinch-zoom (accessibility).
- Make the layout fit the visible viewport so the nav never hides behind browser
  chrome; respect device safe areas in both browser and standalone modes.
- Add browser-native "app feel" (no rubber-band scroll, no tap-highlight flash).
- Give users a discoverable way to install the PWA (Android prompt + iOS hint).

## Non-Goals

- App Store / Play Store native builds (Capacitor/TWA) — explicitly out of scope.
- Email verification / welcome email — a separate workstream (next cycle).
- Any backend change.

## Design

### 1. Input zoom fix
Bump focusable inputs to **16px on mobile**, keeping the current 14px from `md:`
up. Pinch-zoom stays enabled (no `maximum-scale`/`user-scalable=no`).
- `components/chat/composer.tsx`: textarea `text-base md:text-sm`.
- `components/ui/input.tsx`: `text-base md:text-sm`.

### 2. Viewport height + safe areas
- App shell `app/(app)/layout.tsx`: `h-screen` → **`h-dvh`** (dynamic viewport
  height; Tailwind 3.4 native). Also update the loading/auth-guard
  `min-h-screen` → `min-h-dvh`.
- Root `viewport` in `app/layout.tsx`: add `viewportFit: 'cover'` so
  `env(safe-area-inset-*)` resolves to real values.
- `globals.css`: add safe-area padding utilities backed by `env()`:
  `.pt-safe` (`padding-top: env(safe-area-inset-top)`),
  `.pb-safe` (`padding-bottom: env(safe-area-inset-bottom)`),
  using `max()` so they never shrink existing padding to zero.
- Apply `.pt-safe` to `AppHeader` (clears the notch in standalone, since
  `appleWebApp.statusBarStyle` is `black-translucent`), and `.pb-safe` to the
  mobile `AppNav variant="bar"` (clears the home indicator / toolbar).

### 3. Native-feel polish (`globals.css`)
- `body { overscroll-behavior: none; }` — kills rubber-band / pull-to-refresh.
- `-webkit-tap-highlight-color: transparent` — removes the grey tap flash.
- `-webkit-text-size-adjust: 100%` — prevents Safari font inflation.

### 4. Install affordance

**`lib/use-install-prompt.ts`** — a hook, the only piece with real logic and the
unit under test. Returns:
```ts
{
  canInstall: boolean;    // Android/Chrome beforeinstallprompt captured
  isIOS: boolean;         // iPhone/iPad Safari
  isStandalone: boolean;  // already launched as installed app
  visible: boolean;       // should the banner show? (!standalone && !dismissed && (canInstall || isIOS))
  promptInstall: () => Promise<void>; // fires the native Android prompt
  dismiss: () => void;    // persists dismissal in localStorage
}
```
Behavior:
- Listens for `beforeinstallprompt`, prevents default, stashes the event.
- `isStandalone` via `matchMedia('(display-mode: standalone)').matches` OR
  `navigator.standalone === true` (iOS).
- `isIOS` via user-agent (`/iphone|ipad|ipod/i`) AND Safari (exclude in-app
  browsers where Add-to-Home-Screen is unavailable).
- Dismissal persisted under `localStorage['finby_install_dismissed']`.

**`components/app/install-banner.tsx`** — a dismissible bar rendered just above
the bottom nav (mobile only). Uses the hook:
- Android/Chrome (`canInstall`): "Install Finby" button → `promptInstall()`.
- iOS Safari (`isIOS`): hint "Tap Share ↑ then **Add to Home Screen**."
- Renders nothing when `!visible`.
- Rendered as a sibling immediately before `<AppNav variant="bar" />` in
  `app/(app)/layout.tsx`, so it sits directly above the mobile tab-bar (and,
  like that nav, is hidden `md:` and up).

### 5. Testing
- **Vitest unit tests** for `use-install-prompt`:
  - hidden when `isStandalone` (display-mode standalone and iOS `navigator.standalone`).
  - `canInstall` true after a `beforeinstallprompt` event; `visible` true.
  - iOS Safari (no beforeinstallprompt) → `isIOS` true, `visible` true.
  - `dismiss()` sets `visible` false and persists; stays hidden on re-mount.
- CSS/layout changes (#1–3) are not meaningfully unit-testable → **device
  verification** by the user: Safari (browser chrome) and after Add-to-Home-Screen
  (standalone), checking: no zoom on input focus, nav clears the toolbar, header
  clears the notch, no rubber-band scroll.

## Files

| File | Change |
|------|--------|
| `app/layout.tsx` | `viewport.viewportFit: 'cover'` |
| `app/globals.css` | safe-area utilities + overscroll/tap-highlight/text-size-adjust |
| `app/(app)/layout.tsx` | `h-dvh`/`min-h-dvh`; mount `InstallBanner` |
| `components/app/app-header.tsx` | `.pt-safe` |
| `components/app/app-nav.tsx` | `.pb-safe` on the `bar` variant |
| `components/chat/composer.tsx` | textarea `text-base md:text-sm` |
| `components/ui/input.tsx` | `text-base md:text-sm` |
| `lib/use-install-prompt.ts` | **new** — install-state hook |
| `components/app/install-banner.tsx` | **new** — dismissible install bar |

## Risks / Notes

- `dvh` needs a recent browser; Safari 15.4+ and Chrome 108+ support it. Targets
  are fine. No `vh` fallback needed for our audience.
- `black-translucent` status bar requires the `.pt-safe` header padding or the
  header slides under the clock in standalone — covered above.
- iOS detection is heuristic (no programmatic install on iOS); the banner is a
  hint only, dismissible, and never shown in standalone.
