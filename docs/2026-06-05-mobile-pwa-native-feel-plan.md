# Mobile PWA Native-Feel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `chat.finby.app` look and behave like an installed native app on mobile — no input zoom, no nav/URL-bar collision, safe-area aware, with a discoverable PWA install affordance.

**Architecture:** Frontend-only changes in `apps/web`. The install decision logic lives in a pure, node-testable module (`lib/install-prompt.ts`); a thin hook (`lib/use-install-prompt.ts`) wires browser APIs to it; a mobile-only `InstallBanner` renders it. Layout fixes use `h-dvh` + `env(safe-area-inset-*)` utilities. No backend, no new dependencies.

**Tech Stack:** Next.js 15 (App Router), Tailwind 3.4 (native `dvh` units), Vitest (node env), TypeScript strict.

---

## Conventions for every task

- All commands run from `apps/web` unless noted. Repo root is `/home/unicorn/Documents/finby`.
- Typecheck: `pnpm --filter finby-web exec tsc --noEmit`
- Tests: `pnpm --filter finby-web exec vitest run`
- **Do NOT run `pnpm --filter finby-web build` while `next dev` is running** (shared `.next` desyncs). Use `tsc --noEmit` during dev; production build only in Task 7.
- Conventional commits, **no AI-attribution trailer**.

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/install-prompt.ts` | **new** — pure functions: iOS detection + banner-visibility logic |
| `src/lib/install-prompt.test.ts` | **new** — node-env unit tests for the above |
| `src/lib/use-install-prompt.ts` | **new** — hook: browser APIs → pure logic; prompt/dismiss |
| `src/components/app/install-banner.tsx` | **new** — dismissible mobile install bar |
| `src/components/chat/composer.tsx` | modify — 16px textarea on mobile |
| `src/components/ui/input.tsx` | modify — 16px input on mobile |
| `src/app/globals.css` | modify — safe-area utils + overscroll/tap/text-size-adjust |
| `src/app/layout.tsx` | modify — `viewport.viewportFit: 'cover'` |
| `src/app/(app)/layout.tsx` | modify — `h-dvh`/`min-h-dvh`; mount `InstallBanner` |
| `src/components/app/app-header.tsx` | modify — `pt-safe` |
| `src/components/app/app-nav.tsx` | modify — `pb-safe` on the bar variant |

---

### Task 1: Pure install-state logic (TDD)

**Files:**
- Create: `src/lib/install-prompt.ts`
- Test: `src/lib/install-prompt.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/install-prompt.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { detectIOS, computeInstallState } from './install-prompt';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const IOS_INSTAGRAM =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0.0';

describe('detectIOS', () => {
  it('true for iPhone Safari', () => expect(detectIOS(IPHONE)).toBe(true));
  it('false for Android', () => expect(detectIOS(ANDROID)).toBe(false));
  it('false for desktop', () => expect(detectIOS(DESKTOP)).toBe(false));
  it('false inside an in-app browser (Instagram)', () =>
    expect(detectIOS(IOS_INSTAGRAM)).toBe(false));
});

describe('computeInstallState', () => {
  const base = { isStandalone: false, canInstall: false, dismissed: false };

  it('hidden when already standalone', () => {
    expect(
      computeInstallState({ ...base, userAgent: IPHONE, isStandalone: true }).visible,
    ).toBe(false);
  });
  it('visible on iOS Safari as a manual hint', () => {
    const s = computeInstallState({ ...base, userAgent: IPHONE });
    expect(s.isIOS).toBe(true);
    expect(s.visible).toBe(true);
  });
  it('visible on Android once beforeinstallprompt is captured', () => {
    const s = computeInstallState({ ...base, userAgent: ANDROID, canInstall: true });
    expect(s.isIOS).toBe(false);
    expect(s.visible).toBe(true);
  });
  it('hidden on Android before any beforeinstallprompt', () => {
    expect(computeInstallState({ ...base, userAgent: ANDROID }).visible).toBe(false);
  });
  it('hidden once dismissed', () => {
    expect(
      computeInstallState({ ...base, userAgent: IPHONE, dismissed: true }).visible,
    ).toBe(false);
  });
  it('hidden on desktop browsers', () => {
    expect(computeInstallState({ ...base, userAgent: DESKTOP }).visible).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-web exec vitest run src/lib/install-prompt.test.ts`
Expected: FAIL — `Failed to resolve import "./install-prompt"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/install-prompt.ts`:

```ts
/** Chromium-only beforeinstallprompt event (not in lib.dom). */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallEnv {
  userAgent: string;
  isStandalone: boolean;
  canInstall: boolean; // a beforeinstallprompt event was captured
  dismissed: boolean;
}

export interface InstallState {
  isIOS: boolean;
  isStandalone: boolean;
  canInstall: boolean;
  visible: boolean;
}

/** iOS Safari (iPhone/iPad/iPod). Excludes in-app browsers (Facebook,
 *  Instagram, LINE) where "Add to Home Screen" is unavailable. */
export function detectIOS(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  const isAppleMobile = /iphone|ipad|ipod/.test(ua);
  const inAppBrowser = /fb(an|av)|instagram|line\//.test(ua);
  return isAppleMobile && !inAppBrowser;
}

/** Should the install banner show? Never in standalone (already installed);
 *  shown when we can prompt (Android) or on iOS (manual hint), unless the user
 *  has dismissed it. */
export function computeInstallState(env: InstallEnv): InstallState {
  const isIOS = detectIOS(env.userAgent);
  const visible =
    !env.isStandalone && !env.dismissed && (env.canInstall || isIOS);
  return { isIOS, isStandalone: env.isStandalone, canInstall: env.canInstall, visible };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-web exec vitest run src/lib/install-prompt.test.ts`
Expected: PASS — 10 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/unicorn/Documents/finby
git add apps/web/src/lib/install-prompt.ts apps/web/src/lib/install-prompt.test.ts
git commit -m "feat(web): pure install-state logic for PWA install prompt"
```

---

### Task 2: useInstallPrompt hook

**Files:**
- Create: `src/lib/use-install-prompt.ts`

No unit test (DOM glue; Vitest is node-env). Verified by typecheck + on-device.

- [ ] **Step 1: Write the hook**

Create `src/lib/use-install-prompt.ts`:

```ts
'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  computeInstallState,
  type BeforeInstallPromptEvent,
  type InstallState,
} from './install-prompt';

const DISMISS_KEY = 'finby_install_dismissed';

/** Wires browser APIs (beforeinstallprompt, display-mode, navigator) to the
 *  pure computeInstallState. Initial state is "hidden" until the effect runs,
 *  so the banner never flashes during hydration. */
export function useInstallPrompt(): InstallState & {
  promptInstall: () => Promise<void>;
  dismiss: () => void;
} {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [userAgent, setUserAgent] = useState('');
  const [dismissed, setDismissed] = useState(true);
  const [isStandalone, setIsStandalone] = useState(true);

  useEffect(() => {
    setUserAgent(navigator.userAgent);
    setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    setIsStandalone(
      window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true,
    );

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    return () =>
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }, []);

  const promptInstall = useCallback(async () => {
    if (!evt) return;
    await evt.prompt();
    await evt.userChoice;
    setEvt(null);
    dismiss();
  }, [evt, dismiss]);

  const state = computeInstallState({
    userAgent,
    isStandalone,
    canInstall: evt !== null,
    dismissed,
  });

  return { ...state, promptInstall, dismiss };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter finby-web exec tsc --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 3: Commit**

```bash
cd /home/unicorn/Documents/finby
git add apps/web/src/lib/use-install-prompt.ts
git commit -m "feat(web): useInstallPrompt hook (browser glue for install state)"
```

---

### Task 3: InstallBanner component

**Files:**
- Create: `src/components/app/install-banner.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/app/install-banner.tsx`:

```tsx
'use client';

import { useInstallPrompt } from '@/lib/use-install-prompt';

/** Dismissible install hint, mobile-only, rendered directly above the bottom
 *  tab-bar. Android/Chrome → one-tap install; iOS Safari → Add-to-Home-Screen
 *  hint. Renders nothing when already installed or dismissed. */
export function InstallBanner() {
  const { visible, isIOS, canInstall, promptInstall, dismiss } = useInstallPrompt();
  if (!visible) return null;

  return (
    <div className="flex items-center gap-3 border-t border-line bg-surface/90 px-4 py-2.5 backdrop-blur md:hidden">
      <p className="flex-1 text-xs text-muted">
        {isIOS ? (
          <>
            Install Finby: tap <span className="text-ink">Share</span> ↑ then{' '}
            <span className="text-ink">Add to Home Screen</span>.
          </>
        ) : (
          <>Add Finby to your home screen for a faster, full-screen experience.</>
        )}
      </p>
      {canInstall && !isIOS && (
        <button
          onClick={promptInstall}
          className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-hover"
        >
          Install
        </button>
      )}
      <button
        onClick={dismiss}
        aria-label="Dismiss install banner"
        className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-faint transition hover:text-ink"
      >
        ✕
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter finby-web exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
cd /home/unicorn/Documents/finby
git add apps/web/src/components/app/install-banner.tsx
git commit -m "feat(web): dismissible PWA install banner (mobile)"
```

---

### Task 4: Input zoom fix (16px on mobile)

**Files:**
- Modify: `src/components/chat/composer.tsx:46`
- Modify: `src/components/ui/input.tsx:14`

- [ ] **Step 1: Fix the composer textarea**

In `src/components/chat/composer.tsx`, the textarea `className` currently contains `text-sm`. Replace that token with `text-base md:text-sm`:

```tsx
        className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-base text-ink outline-none placeholder:text-faint md:text-sm"
```

- [ ] **Step 2: Fix the Input primitive**

In `src/components/ui/input.tsx`, the input `className` template starts with `w-full rounded-xl border bg-canvas/60 px-3.5 py-2.5 text-sm text-ink ...`. Change `text-sm` to `text-base md:text-sm`:

```tsx
      className={`w-full rounded-xl border bg-canvas/60 px-3.5 py-2.5 text-base text-ink outline-none transition placeholder:text-faint focus:ring-2 focus:ring-accent/30 md:text-sm ${
        invalid ? 'border-danger/70 focus:border-danger' : 'border-line focus:border-accent'
      } ${className}`}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter finby-web exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
cd /home/unicorn/Documents/finby
git add apps/web/src/components/chat/composer.tsx apps/web/src/components/ui/input.tsx
git commit -m "fix(web): 16px inputs on mobile to stop iOS focus zoom"
```

---

### Task 5: Global CSS (safe areas + native-feel) and root viewport

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx:26-29`

- [ ] **Step 1: Add base rules + safe-area utilities to globals.css**

In `src/app/globals.css`, inside the existing `@layer base`, add to the `html`/`body` rules. Change the existing `html, body { height: 100%; }` block and `body` block so they read:

```css
  html,
  body {
    height: 100%;
  }

  html {
    -webkit-text-size-adjust: 100%;
  }

  body {
    @apply bg-canvas text-ink font-sans antialiased;
    overscroll-behavior: none;
    -webkit-tap-highlight-color: transparent;
    background-image:
      radial-gradient(1100px 560px at 82% -12%, rgba(29, 110, 245, 0.12), transparent 60%),
      radial-gradient(820px 480px at -12% 112%, rgba(29, 110, 245, 0.07), transparent 55%);
    background-attachment: fixed;
  }
```

Then in the existing `@layer utilities` block, add two utilities (alongside `.bg-grid` and `.text-balance`):

```css
  .pt-safe {
    padding-top: max(env(safe-area-inset-top), 0px);
  }
  .pb-safe {
    padding-bottom: max(env(safe-area-inset-bottom), 0px);
  }
```

- [ ] **Step 2: Add viewportFit to the root viewport**

In `src/app/layout.tsx`, update the `viewport` export:

```ts
export const viewport: Viewport = {
  themeColor: '#06101f',
  colorScheme: 'dark',
  viewportFit: 'cover',
};
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter finby-web exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
cd /home/unicorn/Documents/finby
git add apps/web/src/app/globals.css apps/web/src/app/layout.tsx
git commit -m "feat(web): safe-area utilities, viewport-fit cover, native-feel scroll"
```

---

### Task 6: App shell wiring (dvh, safe areas, mount banner)

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/components/app/app-header.tsx:21`
- Modify: `src/components/app/app-nav.tsx:49`

- [ ] **Step 1: Header clears the notch**

In `src/components/app/app-header.tsx`, add `pt-safe` to the `<header>` className:

```tsx
    <header className="sticky top-0 z-10 border-b border-line bg-canvas/80 backdrop-blur pt-safe">
```

- [ ] **Step 2: Bottom nav clears the home indicator**

In `src/components/app/app-nav.tsx`, the `bar` variant `<nav>` className currently is `flex border-t border-line bg-surface/80 backdrop-blur md:hidden`. Add `pb-safe`:

```tsx
    <nav className="flex border-t border-line bg-surface/80 backdrop-blur pb-safe md:hidden">
```

- [ ] **Step 3: Use dynamic viewport height + mount the install banner**

In `src/app/(app)/layout.tsx`:

(a) add the import near the other component imports:

```tsx
import { InstallBanner } from '@/components/app/install-banner';
```

(b) change the loading/auth-guard `<main>` from `min-h-screen` to `min-h-dvh`:

```tsx
      <main className="flex min-h-dvh items-center justify-center">
        <TypingDots />
      </main>
```

(c) change the shell container `h-screen` to `h-dvh` and mount `<InstallBanner />` immediately before the bottom `<AppNav variant="bar" />`:

```tsx
  return (
    <div className="flex h-dvh w-full flex-col md:flex-row">
      <AppNav variant="sidebar" />
      <div className="flex min-h-0 flex-1 flex-col">
        <AppHeader />
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
      <InstallBanner />
      <AppNav variant="bar" />
    </div>
  );
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter finby-web exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
cd /home/unicorn/Documents/finby
git add apps/web/src/app/\(app\)/layout.tsx apps/web/src/components/app/app-header.tsx apps/web/src/components/app/app-nav.tsx
git commit -m "feat(web): dvh app shell + safe-area header/nav + mount install banner"
```

---

### Task 7: Full verification + device check

**Files:** none (verification only).

- [ ] **Step 1: Unit tests pass**

Run: `pnpm --filter finby-web exec vitest run`
Expected: PASS — includes the 10 `install-prompt` tests + existing `sanity` test.

- [ ] **Step 2: Typecheck clean**

Run: `pnpm --filter finby-web exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Production build (only if `next dev` is NOT running)**

Run from repo root: `pnpm turbo run build --filter=finby-web`
Expected: build succeeds (Next.js compiled, no type errors).

- [ ] **Step 4: Push so Vercel deploys a preview/production**

```bash
cd /home/unicorn/Documents/finby
git push origin main
```

(If the push is blocked, ask the user to authorize — they have been authorizing pushes.)

- [ ] **Step 5: Device verification checklist (user, on iPhone)**

In **Safari** at `chat.finby.app`:
- [ ] Focusing the chat input does **not** zoom the page.
- [ ] The bottom tab-bar sits fully above Safari's toolbar (no overlap).
- [ ] The page does not rubber-band/pull-to-refresh on overscroll.
- [ ] An install banner appears above the tab-bar with the "Share → Add to Home Screen" hint; ✕ dismisses it and it stays gone on reload.

After **Add to Home Screen**, launch from the icon (standalone):
- [ ] No browser chrome; header content clears the status bar/notch.
- [ ] Bottom nav clears the home indicator.
- [ ] No install banner (already installed).

On **Android/Chrome** (if available):
- [ ] Install banner shows an "Install" button; tapping it fires the native install dialog.

---

## Self-Review

**Spec coverage:**
- Input zoom fix → Task 4 ✓
- `h-dvh` + safe areas + `viewportFit` → Tasks 5, 6 ✓
- Native-feel polish (overscroll/tap/text-size-adjust) → Task 5 ✓
- Install hook + banner → Tasks 1–3, mounted in Task 6 ✓
- Testing (pure logic unit tests + device check) → Tasks 1, 7 ✓
- All 11 files in the spec's file table are touched ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `InstallEnv`/`InstallState`/`BeforeInstallPromptEvent` defined in Task 1 and consumed unchanged in Tasks 2–3; `computeInstallState`/`detectIOS` names consistent; `DISMISS_KEY = 'finby_install_dismissed'` matches the spec.

**Note on spec deviation:** the spec described testing the hook directly; the plan tests the extracted pure module instead (same logic, node-env compatible, no new deps). The hook is verified by typecheck + device. This is a strict improvement and within the spec's "no new dependencies" constraint.
