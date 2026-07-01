import { ScrollView, Text, View } from 'react-native';
import { TIER_LIMITS, type SubscriptionTier } from '@finby/shared';

type Limits = (typeof TIER_LIMITS)['FREE'];
const TIERS: SubscriptionTier[] = ['FREE', 'PRO', 'PREMIUM', 'FAMILY'];
const HEAD: Record<SubscriptionTier, string> = { FREE: 'Free', PRO: 'Pro', PREMIUM: 'Premium', FAMILY: 'Family' };

const numOrUnlimited = (n: number | null, suffix = ''): string => (n === null ? 'Unlimited' : `${n}${suffix}`);
const yesNo = (b: boolean): string => (b ? '✓' : '—');

const ROWS: { feature: string; format: (l: Limits) => string }[] = [
  { feature: 'AI messages/day', format: (l) => numOrUnlimited(l.chatMessagesPerDay) },
  { feature: 'Currencies', format: (l) => numOrUnlimited(l.currencies) },
  { feature: 'History', format: (l) => numOrUnlimited(l.transactionHistoryDays, ' days') },
  { feature: 'Portfolio', format: (l) => yesNo(l.portfolio) },
  { feature: 'AI coaching', format: (l) => yesNo(l.proactiveCoaching) },
  { feature: 'Streak repair', format: (l) => yesNo(l.streakRepair) },
  { feature: 'Members', format: (l) => (l.maxMembers === 1 ? '1' : `Up to ${l.maxMembers}`) },
  { feature: 'Data export', format: (l) => yesNo(l.dataExport) },
];

/** Collapsible plan-comparison grid, values sourced from TIER_LIMITS (single source
 *  of truth). Horizontally scrollable so the four tier columns fit narrow screens. */
export function CompareTable() {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-1">
      <View className="min-w-full">
        {/* Header */}
        <View className="flex-row border-b border-line pb-1.5">
          <Text className="w-32 text-xs font-medium text-muted">Feature</Text>
          {TIERS.map((t) => (
            <Text key={t} className="w-20 text-center text-xs font-medium text-muted">
              {HEAD[t]}
            </Text>
          ))}
        </View>
        {/* Rows */}
        {ROWS.map(({ feature, format }) => (
          <View key={feature} className="flex-row border-b border-line/50 py-1.5">
            <Text className="w-32 text-xs text-muted">{feature}</Text>
            {TIERS.map((t) => (
              <Text key={t} className="w-20 text-center text-xs text-ink">
                {format(TIER_LIMITS[t])}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
