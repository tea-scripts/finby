// apps/mobile/src/components/streak/streak-share-card.tsx
import { Platform, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Wordmark } from '../ui/wordmark';
import { formatXp, type ShareCardStats } from '../../lib/streak-view';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

/** The hero-flame brag card. Fixed 320×400 with an explicit dark background so
 *  the captured PNG is opaque. Rendered off-screen by StreakSheet for capture. */
export function StreakShareCard({ stats }: { stats: ShareCardStats }) {
  return (
    <View style={{ width: 320, height: 400 }} className="justify-between rounded-3xl bg-canvas p-6">
      <View className="flex-row items-center justify-between">
        <Wordmark height={18} />
        <Ionicons name="flame" size={20} color="#f5a524" />
      </View>

      <View className="items-center gap-1">
        <Ionicons name="flame" size={56} color="#f5a524" />
        <Text className="text-warn" style={{ fontFamily: MONO, fontSize: 64, fontWeight: '800' }}>
          {stats.streak}
        </Text>
        <Text className="text-base text-muted">day streak</Text>
      </View>

      <View className="gap-1">
        <Text className="text-lg font-semibold text-ink">{stats.name}</Text>
        <Text className="text-sm text-muted">best {stats.best} · ⚡ {formatXp(stats.xp)} XP</Text>
        <Text className="text-sm text-muted">{stats.daysLogged} days logged</Text>
      </View>

      <Text className="text-xs text-faint">finby.app</Text>
    </View>
  );
}
