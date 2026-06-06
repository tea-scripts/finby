'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { TypingDots } from '@/components/chat/typing-dots';
import { useAuth } from '@/lib/store';

/**
 * Entry gate. Renders only a loader (never marketing content, so there's no
 * flash), then routes by state once the auth store has rehydrated:
 *   signed in        -> /chat
 *   not onboarded    -> /onboarding   (first-launch experience)
 *   onboarded + out  -> /login
 */
export default function HomeGate() {
  const router = useRouter();
  const status = useAuth((s) => s.status);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(useAuth.persist.hasHydrated());
    return useAuth.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (status === 'authed') {
      router.replace('/chat');
      return;
    }
    let onboarded = false;
    try {
      onboarded = Boolean(localStorage.getItem('finby_onboarded'));
    } catch {
      onboarded = false;
    }
    router.replace(onboarded ? '/login' : '/onboarding');
  }, [hydrated, status, router]);

  return (
    <main className="flex min-h-app items-center justify-center">
      <TypingDots />
    </main>
  );
}
