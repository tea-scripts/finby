import type { SubscriptionTier } from '@/lib/types';

const BADGE_CLASSES: Record<SubscriptionTier, string> = {
  FREE: 'bg-slate-500/15 text-slate-300',
  PRO: 'bg-blue-500/15 text-blue-300',
  PREMIUM: 'bg-purple-500/15 text-purple-300',
  FAMILY: 'bg-emerald-500/15 text-emerald-300',
};

const TIER_LABELS: Record<SubscriptionTier, string> = {
  FREE: 'Free',
  PRO: 'Pro',
  PREMIUM: 'Premium',
  FAMILY: 'Family',
};

export function TierBadge({ tier }: { tier: SubscriptionTier }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE_CLASSES[tier]}`}
    >
      {TIER_LABELS[tier]}
    </span>
  );
}
