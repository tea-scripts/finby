// apps/mobile/src/components/streak/achievements-grid.tsx
import { Text, View } from 'react-native';
import { relativeTime, sortAchievementDefs, type AchievementsResult } from '@finby/shared';
import { BadgeImage } from './badge-image';

/** 3-column achievements grid in shared (category→tier) order. Unlocked badges
 *  show their relative unlock time; locked badges are dimmed by BadgeImage. */
export function AchievementsGrid({ workspaceId, achievements }: { workspaceId: string; achievements: AchievementsResult }) {
  const defs = sortAchievementDefs(achievements);
  const unlockedAt = new Map(achievements.unlocked.map((u) => [u.achievementDef.slug, u.unlockedAt]));

  return (
    <View className="flex-row flex-wrap">
      {defs.map((def) => {
        const at = unlockedAt.get(def.slug);
        return (
          <View key={def.slug} className="w-1/3 items-center gap-1 py-2">
            <BadgeImage workspaceId={workspaceId} slug={def.slug} label={def.label} locked={!at} />
            <Text className="text-center text-xs font-medium text-ink">{def.label}</Text>
            {at ? <Text className="text-center text-xs text-muted">{relativeTime(at)}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}
