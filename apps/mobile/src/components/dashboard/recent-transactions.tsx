import { Text, View } from 'react-native';
import { money, shortDate } from '@finby/core';
import type { Transaction } from '@finby/shared';
import { SectionCard, SectionLoading, SectionError, SectionEmpty, type SectionProps } from './section-card';

function txLabel(t: Transaction): string {
  return t.merchant ?? t.description ?? t.category?.name ?? 'Transaction';
}

function TxRow({ t }: { t: Transaction }) {
  const income = t.type === 'INCOME';
  const sign = income ? '+' : '−';
  return (
    <View className="flex-row items-center justify-between gap-3">
      <View className="flex-1">
        <Text className="text-sm font-medium text-ink" numberOfLines={1}>
          {txLabel(t)}
        </Text>
        <Text className="text-xs text-muted">{shortDate(t.transactionDate)}</Text>
      </View>
      <Text className={`text-sm font-semibold ${income ? 'text-success' : 'text-ink'}`}>
        {sign}
        {money(t.amountBase, t.currencyBase)}
      </Text>
    </View>
  );
}

export function RecentTransactions({ state, onRetry }: SectionProps<Transaction[]>) {
  return (
    <SectionCard title="Recent transactions">
      {state.loading ? (
        <SectionLoading />
      ) : state.error || !state.data ? (
        <SectionError onRetry={onRetry} />
      ) : state.data.length === 0 ? (
        <SectionEmpty message="No transactions yet." />
      ) : (
        <View className="gap-3">
          {state.data.map((t) => (
            <TxRow key={t.id} t={t} />
          ))}
        </View>
      )}
    </SectionCard>
  );
}
