// apps/mobile/src/components/streak/streak-stats-grid.tsx
import { Platform, Text, View } from 'react-native';
import { formatXp } from '../../lib/streak-view';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-xl border border-line bg-surface p-3.5">
      <Text className="text-xs text-muted">{label}</Text>
      <Text className="mt-1 text-lg font-semibold text-ink" style={{ fontFamily: MONO }}>
        {value}
      </Text>
    </View>
  );
}

/** 2×2 grid of streak/XP stat tiles (mono values), dashboard style. */
export function StreakStatsGrid({
  longestStreak,
  daysLogged,
  totalXp,
  availableXp,
}: {
  longestStreak: number;
  daysLogged: number;
  totalXp: number;
  availableXp: number;
}) {
  return (
    <View className="gap-3">
      <View className="flex-row gap-3">
        <Tile label="Longest streak" value={String(longestStreak)} />
        <Tile label="Total days logged" value={String(daysLogged)} />
      </View>
      <View className="flex-row gap-3">
        <Tile label="Total XP earned" value={`${formatXp(totalXp)} XP`} />
        <Tile label="Available XP" value={`${formatXp(availableXp)} XP`} />
      </View>
    </View>
  );
}
