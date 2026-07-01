import { Platform, Text, View } from 'react-native';
import { money } from '@finby/core';
import type { SummaryResult } from '@finby/shared';
import { Skeleton } from '../ui/skeleton';
import { SectionCard, SectionError, type SectionProps } from './section-card';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

/** One metric tile in the 2×2 grid: a muted label over a toned, mono value. */
function Stat({ label, value, tone }: { label: string; value: string; tone: 'ink' | 'success' | 'danger' }) {
  const color = tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-ink';
  return (
    <View className="flex-1 rounded-xl border border-line bg-surface p-3.5">
      <Text className="text-xs text-muted">{label}</Text>
      <Text className={`mt-1 text-lg font-semibold ${color}`} style={{ fontFamily: MONO }}>
        {value}
      </Text>
    </View>
  );
}

export function MonthSummary({ state, onRetry }: SectionProps<SummaryResult>) {
  return (
    <SectionCard title="This month">
      {state.loading ? (
        <View className="gap-3" accessible accessibilityLabel="Loading">
          <View className="flex-row gap-3">
            <Skeleton style={{ flex: 1, height: 64 }} />
            <Skeleton style={{ flex: 1, height: 64 }} />
          </View>
          <View className="flex-row gap-3">
            <Skeleton style={{ flex: 1, height: 64 }} />
            <Skeleton style={{ flex: 1, height: 64 }} />
          </View>
        </View>
      ) : state.error || !state.data ? (
        <SectionError onRetry={onRetry} />
      ) : (
        <View className="gap-3">
          <View className="flex-row gap-3">
            <Stat label="Income" value={money(state.data.totalIncome, state.data.currency)} tone="success" />
            <Stat label="Expenses" value={money(state.data.totalExpenses, state.data.currency)} tone="danger" />
          </View>
          <View className="flex-row gap-3">
            <Stat
              label="Net savings"
              value={money(state.data.netSavings, state.data.currency)}
              tone={Number(state.data.netSavings) < 0 ? 'danger' : 'success'}
            />
            <Stat label="Savings rate" value={`${state.data.savingsRate}%`} tone="ink" />
          </View>
        </View>
      )}
    </SectionCard>
  );
}
