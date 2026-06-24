import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

/** Placeholder for the Transactions tab until slice 5c builds the real list. */
export function TransactionsPlaceholderScreen() {
  return (
    <SafeAreaView className="flex-1 items-center justify-center gap-3 bg-canvas px-6">
      <View className="rounded-full bg-surface p-4">
        <Ionicons name="receipt-outline" size={36} color="#5b6f8c" />
      </View>
      <Text className="text-xl font-semibold text-ink">Transactions</Text>
      <Text className="text-center text-sm text-muted">
        Your full transaction history is coming soon.
      </Text>
    </SafeAreaView>
  );
}
