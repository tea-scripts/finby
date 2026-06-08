'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { AppHeader } from '@/components/app/app-header';
import { AppNav } from '@/components/app/app-nav';
import { InstallBanner } from '@/components/app/install-banner';
import { VerifyEmailBanner } from '@/components/app/verify-email-banner';
import { ViewportRecover } from '@/components/app/viewport-recover';
import { TypingDots } from '@/components/chat/typing-dots';
import { useAuth } from '@/lib/store';

/** Authed app shell: hydration-gated auth guard (lifted out of the chat page),
 *  responsive nav (sidebar ≥md, bottom tab-bar on mobile), and shared header.
 *  Chat stays the front door — it just renders inside this shell now. */
export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const status = useAuth((s) => s.status);
  const workspace = useAuth((s) => s.workspace);

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(useAuth.persist.hasHydrated());
    return useAuth.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (hydrated && (status !== 'authed' || !workspace)) {
      router.replace('/login');
    }
  }, [hydrated, status, workspace, router]);

  const content =
    !hydrated || status !== 'authed' || !workspace ? (
      <main className="flex min-h-app items-center justify-center">
        <TypingDots />
      </main>
    ) : (
      <div className="flex h-app w-full flex-col md:flex-row">
        <AppNav variant="sidebar" />
        <div className="flex min-h-0 flex-1 flex-col">
          <AppHeader />
          <VerifyEmailBanner />
          <main className="min-h-0 flex-1 overflow-hidden pb-[calc(5.25rem+env(safe-area-inset-bottom))] md:pb-0">
            {children}
          </main>
        </div>
        <InstallBanner />
        <AppNav variant="bar" />
      </div>
    );

  return (
    <>
      <ViewportRecover />
      {content}
    </>
  );
}
