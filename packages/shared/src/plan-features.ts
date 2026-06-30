import type { SubscriptionTier } from './types';

/** Frontend-owned plan feature copy for the pricing surfaces (shared by web +
 *  mobile). The `/billing/plans` endpoint stays the source of truth for pricing,
 *  checkout, and tier-gate logic; this module owns display structure only. */
export type FeatureBadgeKind = 'beta' | 'soon';

export interface PlanFeature {
  label: string;
  note?: string;
  subtext?: string;
  badge?: FeatureBadgeKind;
}

export interface PlanFeatureSet {
  features: PlanFeature[];
  limitation?: string;
}

export const PLAN_FEATURES: Record<SubscriptionTier, PlanFeatureSet> = {
  FREE: {
    features: [
      { label: 'Chat-based expense logging' },
      { label: '20-message memory window' },
      { label: 'Basic dashboard & analytics' },
      { label: 'Budget tracking', note: 'up to 3 budgets' },
      { label: 'Single currency' },
      { label: 'Spending streak' },
    ],
    limitation:
      'Free users have a 20-message memory window — the AI remembers your last 20 messages only.',
  },
  PRO: {
    features: [
      { label: 'Everything in Free' },
      { label: '90-day conversation memory' },
      { label: 'Unlimited currencies & accounts' },
      { label: 'Receipt scanning', note: '20 scans/day' },
      { label: 'Advanced analytics' },
      { label: 'Budget alerts & daily spending summary' },
      { label: 'Streak repair', note: 'recover a missed day, once' },
      { label: 'Voice chat', badge: 'beta' },
      { label: 'Priority support' },
    ],
  },
  PREMIUM: {
    features: [
      { label: 'Everything in Pro' },
      { label: 'Permanent memory dossier', subtext: 'the agent remembers your full financial history — forever' },
      { label: 'Receipt scanning', note: '50 scans/day' },
      { label: 'AI coaching & proactive spending insights' },
      { label: 'Monthly budget review with AI' },
      { label: 'Streak repair', note: 'recover a missed day, once' },
    ],
  },
  FAMILY: {
    features: [
      { label: 'Everything in Premium' },
      { label: 'Up to 5 members' },
      { label: 'Shared workspace' },
      { label: 'Per-member spending views' },
    ],
  },
};

/** The three most distinctive features for a tier (for the current-plan card),
 *  skipping the "Everything in X" roll-up row. */
export function condensedFeatures(tier: SubscriptionTier): PlanFeature[] {
  return PLAN_FEATURES[tier].features
    .filter((f) => !f.label.startsWith('Everything in'))
    .slice(0, 3);
}
