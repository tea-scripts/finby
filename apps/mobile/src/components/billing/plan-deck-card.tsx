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
  // Deliberately distinct from TIER_NAME.FREE ('Free'): rendering the same literal
  // string in two separate <Text> nodes on this card breaks text-based a11y/test
  // queries (RNTL getByText('Free') matches both) once all four tiers are shown
  // together, as PlanCarouselSheet does.
  const price = tier === 'FREE' ? '$0/mo' : `${formatTierPrice(tier)}/mo`;
  const ctaLabel = isCurrent
    ? 'Current plan'
    : TIER_RANK[tier] > TIER_RANK[currentTier]
      ? `Upgrade to ${TIER_NAME[tier]}`
      : `Switch to ${TIER_NAME[tier]}`;

  return (
    <View
      className={`gap-2 rounded-2xl border p-5 ${focused ? 'border-accent bg-surface-2' : 'border-line bg-surface'}`}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold text-ink">{TIER_NAME[tier]}</Text>
        {isCurrent && (
          <View
            testID="current-pill"
            style={{ backgroundColor: 'rgba(29,110,245,0.15)' }}
            className="rounded-full px-2 py-0.5"
          >
            <Text className="text-[11px] font-medium text-accent">Current plan</Text>
          </View>
        )}
      </View>
      <Text className="text-2xl font-semibold text-ink">{price}</Text>
      <View className="mb-1">
        {PLAN_FEATURES[tier].features.map((f) => (
          <PlanFeatureRow key={f.label} feature={f} />
        ))}
      </View>
      <Button testID="deck-cta" variant={isCurrent ? 'ghost' : 'primary'} disabled={isCurrent} onPress={onSelect}>
        {ctaLabel}
      </Button>
      {isCurrent && <Text className="text-center text-xs text-muted">You&apos;re on this plan</Text>}
    </View>
  );
}
