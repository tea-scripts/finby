import { Text, View } from 'react-native';
import { money } from '@finby/core';
import type { SummaryResult } from '@finby/shared';
import { SectionCard, SectionLoading, SectionError, type SectionProps } from './section-card';

function Row({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  const color = tone === 'pos' ? 'text-success' : tone === 'neg' ? 'text-danger' : 'text-ink';
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-sm text-muted">{label}</Text>
      <Text className={`text-base font-semibold ${color}`}>{value}</Text>
    </View>
  );
}

export function MonthSummary({ state, onRetry }: SectionProps<SummaryResult>) {
  return (
    <SectionCard title="This month">
      {state.loading ? (
        <SectionLoading />
      ) : state.error || !state.data ? (
        <SectionError onRetry={onRetry} />
      ) : (
        <View className="gap-2">
          <Row label="Income" value={money(state.data.totalIncome, state.data.currency)} tone="pos" />
          <Row label="Expenses" value={money(state.data.totalExpenses, state.data.currency)} tone="neg" />
          <View className="my-1 h-px bg-line" />
          <Row label="Net" value={money(state.data.netSavings, state.data.currency)} />
          <Text className="text-xs text-muted">
            {Math.round(state.data.savingsRate)}% saved · {state.data.transactionCount} transactions
          </Text>
        </View>
      )}
    </SectionCard>
  );
}
