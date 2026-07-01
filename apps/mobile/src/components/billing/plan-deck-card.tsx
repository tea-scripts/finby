import { Text, View } from 'react-native';
import { PLAN_FEATURES, formatTierPrice, type SubscriptionTier } from '@finby/shared';
import { TIER_NAME, TIER_RANK } from '../../lib/billing-links';
import { Button } from '../ui/button';
import { PlanFeatureRow } from './plan-feature-row';

/** One card in the plans carousel: tier name, price, feature list, focus styling,
 *  and a CTA derived from the tier's relationship to the current plan. */
export function PlanDeckCard({
  tier,
  currentTier,
  focused,
  onSelect,
}: {
  tier: SubscriptionTier;
  currentTier: SubscriptionTier;
  focused: boolean;
  onSelect: () => void;
}) {
  const isCurrent = tier === currentTier;
  const price = tier === 'FREE' ? 'Free' : `${formatTierPrice(tier)}/mo`;
  const ctaLabel = isCurrent
    ? 'Current plan'
    : TIER_RANK[tier] > TIER_RANK[currentTier]
      ? `Upgrade to ${TIER_NAME[tier]}`
      : `Switch to ${TIER_NAME[tier]}`;

  return (
    <View
      className={`gap-2 rounded-2xl border p-5 ${focused ? 'border-accent bg-surface-2' : 'border-line bg-surface'}`}
      style={{ opacity: focused ? 1 : 0.5 }}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold text-ink">{TIER_NAME[tier]}</Text>
      </View>
      <Text className="text-2xl font-semibold text-ink">{price}</Text>
      <View className="mb-1">
        {PLAN_FEATURES[tier].features.map((f) => (
          <PlanFeatureRow key={f.label} feature={f} />
        ))}
      </View>
      <Button variant={isCurrent ? 'ghost' : 'primary'} disabled={isCurrent} onPress={onSelect}>
        {ctaLabel}
      </Button>
    </View>
  );
}
