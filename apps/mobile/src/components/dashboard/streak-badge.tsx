import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/** Read-only streak indicator (flame + day count). */
export function StreakBadge({ streak }: { streak: number }) {
  return (
    <View className="flex-row items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5">
      <Ionicons name="flame" size={16} color="#f5a524" />
      <Text className="text-sm font-semibold text-ink">{streak}</Text>
    </View>
  );
}
