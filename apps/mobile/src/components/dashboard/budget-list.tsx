import { Text, View } from 'react-native';
import { money } from '@finby/core';
import type { BudgetView } from '@finby/shared';
import { SectionCard, SectionLoading, SectionError, SectionEmpty, type SectionProps } from './section-card';

function BudgetRow({ b }: { b: BudgetView }) {
  const pct = Math.min(100, Math.max(0, b.utilizationPercent));
  const over = b.utilizationPercent >= 100;
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-medium text-ink">{b.category.name}</Text>
        <Text className="text-xs text-muted">
          {money(b.amountSpent, b.currency)} / {money(b.amountLimit, b.currency)}
        </Text>
      </View>
      <View className="h-2 overflow-hidden rounded-full bg-surface-2">
        <View
          className={`h-2 rounded-full ${over ? 'bg-danger' : 'bg-accent'}`}
          style={{ width: `${pct}%` }}
        />
      </View>
    </View>
  );
}

export function BudgetList({ state, onRetry }: SectionProps<BudgetView[]>) {
  return (
    <SectionCard title="Budgets">
      {state.loading ? (
        <SectionLoading />
      ) : state.error || !state.data ? (
        <SectionError onRetry={onRetry} />
      ) : state.data.length === 0 ? (
        <SectionEmpty message="No budgets yet." />
      ) : (
        <View className="gap-4">
          {state.data.map((b) => (
            <BudgetRow key={b.id} b={b} />
          ))}
        </View>
      )}
    </SectionCard>
  );
}
