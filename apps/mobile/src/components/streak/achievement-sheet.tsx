// apps/mobile/src/components/streak/achievement-sheet.tsx
import { Text, View } from 'react-native';
import { relativeTime, type AchievementDefView } from '@finby/shared';
import { BottomSheet } from '../ui/bottom-sheet';
import { BadgeImage } from './badge-image';
import { TierChip } from './tier-chip';

/** Detail sheet for one achievement: the badge, its tier, and what it means —
 *  how to unlock it (locked) or when it was earned (unlocked). Open while
 *  `achievement` is non-null. */
export function AchievementSheet({
  workspaceId,
  achievement,
  unlockedAt,
  onClose,
}: {
  workspaceId: string;
  achievement: AchievementDefView | null;
  unlockedAt?: string;
  onClose: () => void;
}) {
  return (
    <BottomSheet open={!!achievement} onClose={onClose}>
      {achievement ? (
        <View className="items-center gap-3 pb-2">
          <BadgeImage
            workspaceId={workspaceId}
            slug={achievement.slug}
            label={achievement.label}
            locked={!unlockedAt}
            lockedOpacity={0.6}
            size={96}
          />
          <TierChip tier={achievement.tier} />
          <Text className="text-lg font-semibold text-ink">{achievement.label}</Text>
          {unlockedAt ? (
            <>
              <Text className="text-center text-sm text-muted">{achievement.description}</Text>
              <Text className="text-center text-sm font-medium text-success">✓ Unlocked {relativeTime(unlockedAt)}</Text>
            </>
          ) : (
            <Text className="text-center text-sm text-muted">🔒 How to unlock: {achievement.description}</Text>
          )}
        </View>
      ) : null}
    </BottomSheet>
  );
}
