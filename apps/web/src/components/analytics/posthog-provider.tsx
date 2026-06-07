'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { initAnalytics, capturePageview, identifyUser } from '@/lib/analytics';
import { useAuth } from '@/lib/store';

/**
 * Initialises PostHog once, identifies the signed-in (or rehydrated) user, and
 * fires a $pageview on every App-Router navigation. No-ops when no key is set.
 */
export function PostHogProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const userId = useAuth((s) => s.user?.id);
  const tier = useAuth((s) => s.workspace?.tier);

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    if (userId && tier) identifyUser(userId, tier);
  }, [userId, tier]);

  useEffect(() => {
    if (pathname) capturePageview(window.location.origin + pathname);
  }, [pathname]);

  return <>{children}</>;
}
