import { ScrollView, Text, View } from 'react-native';
import { money } from '@finby/core';
import type { AccountView } from '@finby/shared';
import { SectionCard, SectionLoading, SectionError, SectionEmpty, type SectionProps } from './section-card';

function AccountCard({ a }: { a: AccountView }) {
  return (
    <View className="w-40 gap-2 rounded-xl border border-line bg-surface-2 p-3">
      <View className="flex-row items-center gap-2">
        <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: a.color ?? '#1d6ef5' }} />
        <Text className="flex-1 text-sm font-medium text-ink" numberOfLines={1}>
          {a.name}
        </Text>
      </View>
      <Text className="text-lg font-semibold text-ink">{money(a.balance, a.currency)}</Text>
      <Text className="text-xs uppercase tracking-wide text-muted">{a.accountType}</Text>
    </View>
  );
}

export function AccountCarousel({ state, onRetry }: SectionProps<AccountView[]>) {
  const accounts = state.data?.filter((a) => !a.isArchived) ?? [];
  return (
    <SectionCard title="Accounts">
      {state.loading ? (
        <SectionLoading />
      ) : state.error || !state.data ? (
        <SectionError onRetry={onRetry} />
      ) : accounts.length === 0 ? (
        <SectionEmpty message="No accounts yet." />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3">
          {accounts.map((a) => (
            <AccountCard key={a.id} a={a} />
          ))}
        </ScrollView>
      )}
    </SectionCard>
  );
}
