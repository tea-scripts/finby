'use client';

import { useEffect } from 'react';

/**
 * iOS standalone-PWA viewport recovery.
 *
 * In an installed PWA, returning from an external navigation (e.g. the Stripe
 * Checkout in-app browser) can leave CSS `100dvh` resolving to a stale height —
 * the fixed `h-app` shell then ends above the screen bottom and the bottom nav
 * floats up, only fixed by a force-close/reopen. This pins the shell to the
 * live JS-measured viewport height via the `--app-h` custom property and
 * re-applies it whenever the PWA becomes visible again.
 *
 * Standalone only: in a normal browser `--app-h` stays unset, so `.h-app` /
 * `.min-h-app` fall back to `100dvh` (which correctly tracks the browser
 * toolbar). Uses `window.innerHeight` (full height, unaffected by the on-screen
 * keyboard) rather than `visualViewport.height`, to avoid layout jumps while
 * typing in chat.
 */
export function ViewportRecover() {
  useEffect(() => {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true;
    if (!isStandalone) return;

    const apply = () => {
      document.documentElement.style.setProperty('--app-h', `${window.innerHeight}px`);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') apply();
    };

    apply();
    window.addEventListener('pageshow', apply);
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.removeEventListener('pageshow', apply);
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return null;
}
