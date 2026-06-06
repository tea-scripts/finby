'use client';

import { useState } from 'react';
import { LockKey } from '@phosphor-icons/react';
import type { SubscriptionTier } from '@finby/shared';
import { useAuth } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { UpgradeModal } from './UpgradeModal';

const tierRank: Record<SubscriptionTier, number> = {
  FREE: 0,
  PRO: 1,
  PREMIUM: 2,
  FAMILY: 3,
};

const TIER_LABEL: Record<'PRO' | 'PREMIUM' | 'FAMILY', string> = {
  PRO: 'Pro',
  PREMIUM: 'Premium',
  FAMILY: 'Family',
};

interface UpgradeGateProps {
  requiredTier: 'PRO' | 'PREMIUM' | 'FAMILY';
  featureName: string;
  children: React.ReactNode;
}

export function UpgradeGate({ requiredTier, featureName, children }: UpgradeGateProps) {
  const tier = useAuth((s) => s.workspace?.tier) ?? 'FREE';
  const [open, setOpen] = useState(false);

  if (tierRank[tier] >= tierRank[requiredTier]) {
    return <>{children}</>;
  }

  return (
    <>
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface/60 p-6 text-center shadow-card sm:p-8">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent/10">
          <LockKey size={22} weight="fill" className="text-accent" />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-ink">{featureName}</p>
          <p className="text-xs text-muted">
            Available on {TIER_LABEL[requiredTier]} and above.
          </p>
        </div>
        <Button variant="primary" className="mt-1 w-full sm:w-auto" onClick={() => setOpen(true)}>
          Upgrade
        </Button>
      </div>

      <UpgradeModal open={open} onClose={() => setOpen(false)} initialTier={requiredTier} />
    </>
  );
}
