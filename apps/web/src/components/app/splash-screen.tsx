'use client';

import { useEffect, useState } from 'react';
import { Logo } from '@/components/logo';
import { useAuth } from '@/lib/store';

const MIN_VISIBLE_MS = 600; // never flash — hold at least this long
const FADE_MS = 450; // must match the opacity transition below
const SAFETY_MS = 4000; // never let the splash stick if hydration never signals

/**
 * Native-style launch splash. Rendered at the app root so it paints on the
 * very first frame (covers the iOS PWA blank-flash gap, complements Android's
 * manifest splash). Fades out once the auth store has hydrated and the shell is
 * mounted — with a short minimum so it doesn't flicker on fast loads. Per-page
 * API data keeps its own skeletons; the splash only gates the app shell.
 */
export function SplashScreen() {
  const [fading, setFading] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const start = Date.now();
    let hydrated = useAuth.persist.hasHydrated();
    let dismissed = false;

    const dismiss = () => {
      if (dismissed || !hydrated) return;
      dismissed = true;
      const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - start));
      window.setTimeout(() => {
        setFading(true);
        window.setTimeout(() => setHidden(true), FADE_MS);
      }, wait);
    };

    const unsub = useAuth.persist.onFinishHydration(() => {
      hydrated = true;
      dismiss();
    });
    const safety = window.setTimeout(() => {
      hydrated = true;
      dismiss();
    }, SAFETY_MS);

    dismiss(); // already hydrated on mount (fast path)

    return () => {
      unsub();
      window.clearTimeout(safety);
    };
  }, []);

  if (hidden) return null;

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-canvas transition-opacity ease-out ${
        fading ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      {/* soft accent glow behind the mark for depth */}
      <div
        className="pointer-events-none absolute h-64 w-64 rounded-full opacity-50 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(29,110,245,0.22), transparent 70%)' }}
      />

      <div className="relative flex flex-col items-center gap-7">
        <div className="animate-splash-pulse">
          <Logo />
        </div>
        {/* indeterminate shimmer — only draws the eye if load runs long */}
        <div className="h-0.5 w-28 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/2 rounded-full bg-accent animate-splash-shimmer" />
        </div>
      </div>
    </div>
  );
}
