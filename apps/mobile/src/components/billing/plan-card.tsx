import { Text, View } from 'react-native';
import { PLAN_FEATURES, formatTierPrice, type SubscriptionTier } from '@finby/shared';
import { PlanFeatureRow } from './plan-feature-row';

const TIER_NAME: Record<SubscriptionTier, string> = { FREE: 'Free', PRO: 'Pro', PREMIUM: 'Premium', FAMILY: 'Family' };

/** A single plan's card: name, monthly price (paid tiers), feature list, and a
 *  "Current plan" marker for the user's tier. Pure display — pricing/features
 *  come from @finby/shared. */
export function PlanCard({ tier, current }: { tier: SubscriptionTier; current: boolean }) {
  const price = tier === 'FREE' ? 'Free' : `${formatTierPrice(tier)}/mo`;
  return (
    <View className={`gap-2 rounded-2xl border bg-surface p-4 ${current ? 'border-accent' : 'border-line'}`}>
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold text-ink">{TIER_NAME[tier]}</Text>
        {current ? (
          <Text className="text-xs font-semibold text-accent">Current plan</Text>
        ) : (
          <Text className="text-sm font-semibold text-ink">{price}</Text>
        )}
      </View>
      <View>
        {PLAN_FEATURES[tier].features.map((f) => (
          <PlanFeatureRow key={f.label} feature={f} />
        ))}
      </View>
    </View>
  );
}
