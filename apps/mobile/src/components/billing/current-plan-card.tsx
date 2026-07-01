import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  condensedFeatures,
  PLAN_FEATURES,
  TIER_LIMITS,
  type SubscriptionView,
} from '@finby/shared';
import { TIER_NAME } from '../../lib/billing-links';
import { Button } from '../ui/button';
import { TierBadge } from '../ui/tier-badge';
import { PlanFeatureRow } from './plan-feature-row';
import { CompareTable } from './compare-table';

const FREE = TIER_LIMITS.FREE;
const FREE_LIMIT_ROWS: { label: string; value: string }[] = [
  { label: 'AI messages', value: FREE.chatMessagesPerDay !== null ? `${FREE.chatMessagesPerDay}/day` : 'Unlimited' },
  { label: 'Currencies', value: FREE.currencies !== null ? `${FREE.currencies} currency` : 'Unlimited' },
  { label: 'Transaction history', value: FREE.transactionHistoryDays !== null ? `${FREE.transactionHistoryDays}-day history` : 'Unlimited' },
  { label: 'Custom categories', value: FREE.customCategories !== null ? `${FREE.customCategories} categories` : 'Unlimited' },
  { label: 'Members', value: `${FREE.maxMembers} member` },
];

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/** Inline current-plan card (mirrors the web PlanCard): current tier + a limit/feature
 *  summary, billing context, the Upgrade/Change CTA (opens the carousel), Manage
 *  Billing (paid + Stripe), and a collapsible plan comparison. */
export function CurrentPlanCard({
  sub,
  onChangePlan,
  onManage,
  managing,
}: {
  sub: SubscriptionView;
  onChangePlan: () => void;
  onManage: () => void;
  managing: boolean;
}) {
  const isFree = sub.tier === 'FREE';
  const [compareOpen, setCompareOpen] = useState(false);

  return (
    <View className="gap-3 rounded-2xl border border-line bg-surface p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-semibold uppercase tracking-wide text-muted">Current plan</Text>
        <TierBadge tier={sub.tier} />
      </View>

      {isFree ? (
        <>
          <View className="gap-1.5">
            {FREE_LIMIT_ROWS.map((r) => (
              <View key={r.label} className="flex-row items-center justify-between">
                <Text className="text-sm text-muted">{r.label}</Text>
                <Text className="text-sm font-medium text-ink">{r.value}</Text>
              </View>
            ))}
          </View>
          <Text className="text-xs italic text-muted">{PLAN_FEATURES.FREE.limitation}</Text>
        </>
      ) : (
        <>
          <View>
            {condensedFeatures(sub.tier).map((f) => (
              <PlanFeatureRow key={f.label} feature={f} />
            ))}
          </View>
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
        </>
      )}

      <View className="gap-2">
        <Button onPress={onChangePlan}>{isFree ? 'Upgrade to Pro' : 'Change plan'}</Button>
        {!isFree && sub.billingProvider === 'STRIPE' ? (
          <Button variant="ghost" loading={managing} onPress={onManage}>
            Manage billing
          </Button>
        ) : null}
      </View>

      <Pressable
        onPress={() => setCompareOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: compareOpen }}
        hitSlop={8}
      >
        <Text className="text-center text-xs font-medium text-accent">
          {compareOpen ? 'Hide plan comparison' : 'Compare plans'}
        </Text>
      </Pressable>
      {compareOpen ? <CompareTable /> : null}
    </View>
  );
}
