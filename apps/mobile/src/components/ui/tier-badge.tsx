import { Text, View } from 'react-native';
import type { SubscriptionTier } from '@finby/shared';
import { TIER_NAME } from '../../lib/billing-links';

// Per-tier accent (bg tint + text), mirroring the web TierBadge palette.
const TIER_STYLE: Record<SubscriptionTier, { bg: string; fg: string }> = {
  FREE: { bg: 'rgba(141,163,192,0.15)', fg: '#8da3c0' },
  PRO: { bg: 'rgba(29,110,245,0.15)', fg: '#1d6ef5' },
  PREMIUM: { bg: 'rgba(139,92,246,0.18)', fg: '#a78bfa' },
  FAMILY: { bg: 'rgba(31,174,106,0.18)', fg: '#1fae6a' },
};

/** A small colored pill naming a subscription tier. */
export function TierBadge({ tier }: { tier: SubscriptionTier }) {
  const s = TIER_STYLE[tier];
  return (
    <View style={{ backgroundColor: s.bg }} className="rounded-full px-2.5 py-0.5">
      <Text style={{ color: s.fg }} className="text-xs font-semibold">
        {TIER_NAME[tier]}
      </Text>
    </View>
  );
}
