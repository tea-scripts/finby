// apps/mobile/src/components/streak/xp-history.tsx
import { Text, View } from 'react-native';
import { relativeTime, xpEventLabel, type XpTransactionView } from '@finby/shared';

/** The XP ledger feed (newest first as the API returns it): event label +
 *  relative time on the left, a green/red signed delta on the right. */
export function XpHistory({ history }: { history: XpTransactionView[] }) {
  if (history.length === 0) {
    return <Text className="text-sm text-muted">No XP earned yet — log a transaction to get started.</Text>;
  }
  return (
    <View>
      {history.map((tx, i) => (
        <View
          key={tx.id}
          className={`flex-row items-center justify-between py-3 ${i > 0 ? 'border-t border-line' : ''}`}
        >
          <View>
            <Text className="text-sm text-ink">{xpEventLabel(tx.event)}</Text>
            <Text className="text-xs text-muted">{relativeTime(tx.createdAt)}</Text>
          </View>
          <Text className={`text-sm font-medium ${tx.delta > 0 ? 'text-success' : 'text-danger'}`}>
            {tx.delta > 0 ? '+' : ''}
            {tx.delta} XP
          </Text>
        </View>
      ))}
    </View>
  );
}
