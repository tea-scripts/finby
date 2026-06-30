import { Text, View } from 'react-native';
import { condensedFeatures, type SubscriptionTier, type SubscriptionView } from '@finby/shared';
import { Button } from '../ui/button';
import { PlanFeatureRow } from './plan-feature-row';

const TIER_NAME: Record<SubscriptionTier, string> = { FREE: 'Free', PRO: 'Pro', PREMIUM: 'Premium', FAMILY: 'Family' };

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/** Current-plan summary: tier + status + billing context + condensed features,
 *  with the Upgrade/Change CTA and (paid + Stripe) Manage billing. */
export function CurrentPlan({
  sub,
  onUpgrade,
  onManage,
  managing,
}: {
  sub: SubscriptionView;
  onUpgrade: () => void;
  onManage: () => void;
  managing: boolean;
}) {
  const isFree = sub.tier === 'FREE';
  return (
    <View className="gap-3 rounded-2xl border border-line bg-surface p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-semibold uppercase tracking-wide text-muted">Current plan</Text>
        <Text className="text-base font-semibold text-ink">{TIER_NAME[sub.tier]}</Text>
      </View>

      <View>
        {condensedFeatures(sub.tier).map((f) => (
          <PlanFeatureRow key={f.label} feature={f} />
        ))}
      </View>

      {!isFree ? (
        <View className="gap-0.5">
          {sub.currentPeriodEnd ? (
            <Text className="text-sm text-muted">Next billing date: {shortDate(sub.currentPeriodEnd)}</Text>
          ) : null}
          {sub.cancelAtPeriodEnd ? (
            <Text className="text-sm text-warn">Your plan cancels at the end of the current period.</Text>
          ) : null}
          {sub.pendingTier && sub.pendingTierEffectiveAt ? (
            <Text className="text-sm text-warn">
              Changes to {TIER_NAME[sub.pendingTier]} on {shortDate(sub.pendingTierEffectiveAt)}.
            </Text>
          ) : null}
        </View>
      ) : null}

      <View className="gap-2">
        <Button onPress={onUpgrade}>{isFree ? 'Upgrade' : 'Change plan'}</Button>
        {!isFree && sub.billingProvider === 'STRIPE' ? (
          <Button variant="ghost" loading={managing} onPress={onManage}>
            Manage billing
          </Button>
        ) : null}
      </View>
    </View>
  );
}
