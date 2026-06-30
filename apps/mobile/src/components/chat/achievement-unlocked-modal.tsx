import { useEffect } from 'react';
import { Modal, Share, Text, View } from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import type { NewAchievement } from '@finby/shared';
import { BadgeImage } from '../streak/badge-image';
import { TierChip } from '../streak/tier-chip';
import { Button } from '../ui/button';
import { celebrateHaptic } from '../../lib/haptics';

/** Full-screen celebration shown when a chat-logged transaction unlocks an
 *  achievement: confetti + a success haptic over a centered badge card.
 *  Open while `achievement` is non-null; `remaining` is the queue length. */
export function AchievementUnlockedModal({
  workspaceId,
  achievement,
  remaining,
  onContinue,
}: {
  workspaceId: string;
  achievement: NewAchievement | null;
  remaining: number;
  onContinue: () => void;
}) {
  const slug = achievement?.slug;
  // Replays the haptic for each achievement in the queue (slug changes).
  useEffect(() => {
    if (slug) celebrateHaptic();
  }, [slug]);

  function onShare() {
    if (!achievement) return;
    void Share.share({ message: `I just unlocked "${achievement.label}" on Finby!` }).catch(() => {});
  }

  return (
    <Modal visible={!!achievement} transparent animationType="fade" onRequestClose={onContinue}>
      {achievement ? (
        <View className="flex-1 items-center justify-center bg-black/70 px-8">
          <View className="w-full max-w-sm items-center gap-4 rounded-3xl border border-line bg-surface p-6">
            <Text className="text-sm font-semibold uppercase tracking-wide text-accent">Achievement unlocked! 🎉</Text>
            <BadgeImage workspaceId={workspaceId} slug={achievement.slug} label={achievement.label} locked={false} size={120} />
            <TierChip tier={achievement.tier} />
            <Text className="text-center text-xl font-bold text-ink">{achievement.label}</Text>
            <View className="w-full gap-2">
              <Button onPress={onContinue}>{remaining > 1 ? `Next (${remaining - 1} more)` : 'Continue'}</Button>
              <Button variant="ghost" onPress={onShare}>
                Share
              </Button>
            </View>
          </View>
          <ConfettiCannon count={150} origin={{ x: -10, y: 0 }} autoStart fadeOut />
        </View>
      ) : null}
    </Modal>
  );
}
