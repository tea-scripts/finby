import { Platform, Pressable, Text, View } from 'react-native';
import { money } from '@finby/core';
import type { Transaction } from '@finby/shared';
import { TransactionAvatar } from '../category/transaction-avatar';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

function tone(type: string): string {
  if (type === 'INCOME') return 'text-success';
  if (type === 'EXPENSE') return 'text-ink';
  return 'text-muted';
}
function sign(type: string): string {
  if (type === 'INCOME') return '+';
  if (type === 'EXPENSE') return '−';
  return '';
}

export function TransactionRow({ tx, onPress }: { tx: Transaction; onPress: () => void }) {
  const title = tx.merchant ?? tx.description ?? 'Transaction';
  const categoryName = tx.category?.name ?? null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-row items-center gap-3 px-1 py-3"
    >
      <TransactionAvatar tx={tx} />
      <View className="min-w-0 flex-1">
        <Text className="text-sm text-ink" numberOfLines={1}>
          {title}
        </Text>
        {categoryName || tx.tags.length > 0 ? (
          <View className="mt-0.5 flex-row flex-wrap items-center gap-1.5">
            {categoryName ? <Text className="text-xs text-muted">{categoryName}</Text> : null}
            {tx.tags.map((t) => (
              <Text
                key={t}
                className="rounded-md border border-accent/30 bg-accent-soft px-1.5 py-0.5 text-[11px] text-accent"
              >
                {t}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
      <Text className={`shrink-0 text-sm font-semibold ${tone(tx.type)}`} style={{ fontFamily: MONO }}>
        {sign(tx.type)}
        {money(tx.amountOriginal, tx.currencyOriginal)}
      </Text>
    </Pressable>
  );
}
