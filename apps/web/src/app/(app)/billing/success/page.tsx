'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { getSubscription } from '@/lib/billing-api';
import { useAuth } from '@/lib/store';
import { track } from '@/lib/analytics';
import type { SubscriptionTier } from '@/lib/types';
import { Button } from '@/components/ui/button';

const TIER_LABELS: Record<SubscriptionTier, string> = {
  FREE: 'Free',
  PRO: 'Pro',
  PREMIUM: 'Premium',
  FAMILY: 'Family',
};

const MAX_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 1500;

type Phase = 'polling' | 'upgraded' | 'delayed';

export default function BillingSuccessPage() {
  const workspace = useAuth((s) => s.workspace);
  const setWorkspaceTier = useAuth((s) => s.setWorkspaceTier);

  const [phase, setPhase] = useState<Phase>('polling');
  const [tier, setTier] = useState<SubscriptionTier>('FREE');

  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    if (!workspace) return;

    const workspaceId = workspace.id;
    let attempt = 0;

    async function poll() {
      if (cancelledRef.current) return;

      attempt += 1;
      try {
        const sub = await getSubscription(workspaceId);
        if (cancelledRef.current) return;

        if (sub.tier !== 'FREE') {
          setTier(sub.tier);
          setWorkspaceTier(sub.tier);
          track('subscription_activated', { tier: sub.tier });
          setPhase('upgraded');
          return;
        }
      } catch {
        // ignore transient errors; keep polling
      }

      if (cancelledRef.current) return;

      if (attempt < MAX_ATTEMPTS) {
        setTimeout(poll, POLL_INTERVAL_MS);
      } else {
        setPhase('delayed');
      }
    }

    poll();

    return () => {
      cancelledRef.current = true;
    };
  }, [workspace, setWorkspaceTier]);

  return (
    <div className="h-full overflow-y-auto pb-nav">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 animate-fade-up">
        <div className="rounded-2xl border border-line bg-surface/60 p-8 shadow-card flex flex-col items-center gap-6 text-center">
          {phase === 'polling' && (
            <>
              <span
                aria-hidden="true"
                className="h-10 w-10 animate-spin rounded-full border-4 border-accent/30 border-t-accent"
              />
              <div className="space-y-1">
                <h1 className="font-display text-xl font-bold text-ink">
                  Finalizing your upgrade…
                </h1>
                <p className="text-sm text-muted">
                  This usually takes just a moment.
                </p>
              </div>
            </>
          )}

          {phase === 'upgraded' && (
            <>
              <span className="text-4xl" role="img" aria-label="party">
                🎉
              </span>
              <div className="space-y-1">
                <h1 className="font-display text-xl font-bold text-ink">
                  You&apos;re on {TIER_LABELS[tier]}!
                </h1>
                <p className="text-sm text-muted">
                  Your plan is now active. Enjoy your new features.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link href="/settings">
                  <Button variant="ghost">View Settings</Button>
                </Link>
                <Link href="/chat">
                  <Button variant="primary">Go to Chat</Button>
                </Link>
              </div>
            </>
          )}

          {phase === 'delayed' && (
            <>
              <span className="text-4xl" role="img" aria-label="check">
                ✓
              </span>
              <div className="space-y-1">
                <h1 className="font-display text-xl font-bold text-ink">
                  Your upgrade is being processed
                </h1>
                <p className="text-sm text-muted">
                  It may take a minute or two to reflect. Check back shortly or
                  visit Settings.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link href="/settings">
                  <Button variant="ghost">View Settings</Button>
                </Link>
                <Link href="/chat">
                  <Button variant="primary">Go to Chat</Button>
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
