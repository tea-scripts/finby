import { Text, View } from 'react-native';
import { money } from '@finby/core';
import type { InsightResult } from '@finby/shared';
import { Skeleton } from '../ui/skeleton';
import { LOADING_LABEL, SectionError, type SectionProps } from './section-card';

export function InsightCard({ state, onRetry }: SectionProps<InsightResult>) {
  if (state.loading) {
    return (
      <View className="gap-2 rounded-2xl border border-line bg-surface p-4" accessible accessibilityLabel={LOADING_LABEL}>
        <Skeleton style={{ height: 14, width: '90%' }} />
        <Skeleton style={{ height: 14, width: '60%' }} />
      </View>
    );
  }
  if (state.error || !state.data) return <SectionError onRetry={onRetry} />;
  const d = state.data;

  // Flat / no-history → plain server message.
  if (d.direction === 'flat') {
    return (
      <View className="rounded-2xl border border-line bg-surface p-4">
        <Text className="text-sm text-muted">{d.message}</Text>
      </View>
    );
  }

  const deltaColor = d.direction === 'less' ? 'text-success' : 'text-danger';
  const lead = d.projectionApplies ? "You're on pace to spend " : 'You spent ';
  const cmp = d.projectionApplies ? ' than last month.' : ' than the month before.';
  const showSavings = d.projectionApplies && d.projectedSavings !== null && Number(d.projectedSavings) > 0;

  return (
    <View className="rounded-2xl border border-line bg-surface p-4">
      <Text className="text-sm text-ink">
        {lead}
        <Text className={`font-semibold ${deltaColor}`}>
          {d.spendDeltaPercent}% {d.direction}
        </Text>
        {cmp}
        {showSavings ? (
          <Text className="text-ink">
            {' '}At this rate you'll save{' '}
            <Text className="font-semibold text-ink">{money(d.projectedSavings as string, d.currency)}</Text>
            {' '}this month.
          </Text>
        ) : null}
      </Text>
    </View>
  );
}
