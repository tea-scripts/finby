import { Platform, Text, View } from 'react-native';
import { money } from '@finby/core';
import type { BudgetView } from '@finby/shared';
import { CategoryAvatar } from '../category/category-avatar';
import { SectionCard, SectionLoading, SectionError, SectionEmpty, type SectionProps } from './section-card';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

/** Bar color by utilization: green under 75%, amber 75–99%, red at/over 100%. */
function barColor(pct: number): string {
  if (pct >= 100) return 'bg-danger';
  if (pct >= 75) return 'bg-warn';
  return 'bg-success';
}

function BudgetRow({ b }: { b: BudgetView }) {
  const pct = Math.round(b.utilizationPercent);
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center gap-2">
        <CategoryAvatar category={b.category} size="sm" />
        <Text className="min-w-0 flex-1 text-sm text-ink" numberOfLines={1}>
          {b.category.name}
        </Text>
        <Text className="text-xs text-muted" style={{ fontFamily: MONO }}>
          {money(b.amountSpent, b.currency)} / {money(b.amountLimit, b.currency)}
        </Text>
      </View>
      <View className="flex-row items-center gap-2">
        <View className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
          <View
            className={`h-2 rounded-full ${barColor(pct)}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </View>
        <Text className="w-10 text-right text-xs text-muted">{pct}%</Text>
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
