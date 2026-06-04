'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** On first visit (no onboarding flag yet), send the user through the
 *  onboarding slides before the landing/sign-in. Runs once, client-side. */
export function OnboardingRedirect() {
  const router = useRouter();
  useEffect(() => {
    try {
      if (!localStorage.getItem('finby_onboarded')) {
        router.replace('/onboarding');
      }
    } catch {
      /* storage blocked — just show the landing */
    }
  }, [router]);
  return null;
}
