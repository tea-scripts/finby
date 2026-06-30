import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/** Streak indicator (flame + day count). Tappable when `onPress` is provided. */
export function StreakBadge({ streak, onPress }: { streak: number; onPress?: () => void }) {
  const body = (
    <View className="flex-row items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5">
      <Ionicons name="flame" size={16} color="#f5a524" />
      <Text className="text-sm font-semibold text-ink">{streak}</Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="View your streak" hitSlop={8}>
      {body}
    </Pressable>
  );
}
