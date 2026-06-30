// apps/mobile/src/components/streak/achievements-grid.tsx
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { relativeTime, sortAchievementDefs, type AchievementDefView, type AchievementsResult } from '@finby/shared';
import { BadgeImage } from './badge-image';
import { AchievementSheet } from './achievement-sheet';

/** 3-column achievements grid in shared (category→tier) order. Unlocked badges
 *  show their relative unlock time; locked badges are dimmed by BadgeImage.
 *  Tapping a badge opens its detail sheet. */
export function AchievementsGrid({ workspaceId, achievements }: { workspaceId: string; achievements: AchievementsResult }) {
  const defs = sortAchievementDefs(achievements);
  const unlockedAt = new Map(achievements.unlocked.map((u) => [u.achievementDef.slug, u.unlockedAt]));
  const [selected, setSelected] = useState<AchievementDefView | null>(null);

  return (
    <>
      <View className="flex-row flex-wrap">
        {defs.map((def) => {
          const at = unlockedAt.get(def.slug);
          return (
            <Pressable
              key={def.slug}
              testID={`achievement-${def.slug}`}
              onPress={() => setSelected(def)}
              accessibilityRole="button"
              hitSlop={8}
              className="w-1/3 items-center gap-1 py-2"
            >
              <BadgeImage workspaceId={workspaceId} slug={def.slug} label={def.label} locked={!at} />
              <Text className="text-center text-xs font-medium text-ink">{def.label}</Text>
              {at ? <Text className="text-center text-xs text-muted">{relativeTime(at)}</Text> : null}
            </Pressable>
          );
        })}
      </View>
      <AchievementSheet
        workspaceId={workspaceId}
        achievement={selected}
        unlockedAt={selected ? unlockedAt.get(selected.slug) : undefined}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
