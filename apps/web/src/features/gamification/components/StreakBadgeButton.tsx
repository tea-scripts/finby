'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/store';
import { useGamificationStore } from '@/lib/gamification-store';
import { getStreakStatus } from '@/lib/streaks-api';
import { StreakBadge } from '@/components/streak/StreakBadge';
import { StreakSheet } from './StreakSheet';
import type { StreakStatus } from '@/lib/types';

/** Header entry point for the streak system. Shows the live streak badge (with
 *  an at-risk ring) and opens the StreakSheet on tap. Auto-opens in milestone
 *  state when a logged transaction unlocks an achievement (via the gamification
 *  store), then clears that milestone on close. Replaces the old StreakRepair. */
export function StreakBadgeButton() {
  const workspaceId = useAuth((s) => s.workspace?.id);
  const streakCount = useAuth((s) => s.user?.currentStreak ?? 0);
  const milestoneAchievements = useGamificationStore((s) => s.milestoneAchievements);
  const clearMilestones = useGamificationStore((s) => s.clearMilestoneAchievements);

  const [open, setOpen] = useState(false);
  const [atRisk, setAtRisk] = useState(false);

  // Drive the badge's at-risk ring; re-check when the streak count moves so the
  // ring clears right after a logged transaction.
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    getStreakStatus(workspaceId)
      .then((s: StreakStatus) => {
        if (!cancelled) setAtRisk(s.atRisk);
      })
      .catch(() => {
        /* ignore — the badge still shows the live store streak */
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, streakCount]);

  // A just-logged transaction that unlocked a badge opens the sheet in milestone state.
  useEffect(() => {
    if (milestoneAchievements.length > 0) setOpen(true);
  }, [milestoneAchievements]);

  if (!workspaceId) return null;

  function close() {
    setOpen(false);
    clearMilestones();
  }

  return (
    <>
      <StreakBadge
        streak={streakCount}
        size="sm"
        showZero
        atRisk={atRisk}
        onClick={() => setOpen(true)}
      />
      <StreakSheet
        open={open}
        onClose={close}
        workspaceId={workspaceId}
        milestoneAchievements={milestoneAchievements}
      />
    </>
  );
}
