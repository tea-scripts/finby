// apps/mobile/src/components/streak/streak-overview.tsx
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/** The streak hero: flame + current streak, with the best streak alongside. */
export function StreakOverview({ currentStreak, longestStreak }: { currentStreak: number; longestStreak: number }) {
  return (
    <View className="flex-row items-center justify-between">
      <View className="flex-row items-center gap-3">
        <Ionicons name="flame" size={40} color="#f5a524" />
        <View>
          <Text className="text-3xl font-bold text-ink">{currentStreak}</Text>
          <Text className="text-sm text-muted">{currentStreak === 1 ? 'day' : 'days'} streak</Text>
        </View>
      </View>
      <View className="items-end">
        <Text className="text-sm text-muted">Best</Text>
        <Text className="text-lg font-semibold text-ink">
          {longestStreak} {longestStreak === 1 ? 'day' : 'days'}
        </Text>
      </View>
    </View>
  );
}
