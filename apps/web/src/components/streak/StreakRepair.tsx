'use client';

import { useEffect, useRef, useState } from 'react';
import { TIER_LIMITS } from '@finby/shared';
import { useAuth } from '@/lib/store';
import { getStreakStatus, repairStreak } from '@/lib/streaks-api';
import { StreakBadge } from '@/components/streak/StreakBadge';
import { UpgradeModal } from '@/components/billing/UpgradeModal';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import type { StreakStatus } from '@/lib/types';

/** Header streak badge with repair behaviour. Fetches live status; when the
 *  streak is at risk the badge becomes tappable: Pro+ eligible users confirm a
 *  repair, Free users see the UpgradeModal, and users who already repaired this
 *  month get an explanatory note. */
export function StreakRepair() {
  const user = useAuth((s) => s.user);
  const workspaceId = useAuth((s) => s.workspace?.id);
  const tier = useAuth((s) => s.workspace?.tier) ?? 'FREE';
  const setUser = useAuth((s) => s.setUser);

  const [status, setStatus] = useState<StreakStatus | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    getStreakStatus(workspaceId)
      .then((s) => {
        if (!cancelled && mounted.current) setStatus(s);
      })
      .catch(() => {
        /* ignore — badge falls back to the store streak */
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const streak = status?.currentStreak ?? user?.currentStreak ?? 0;
  const atRisk = status?.atRisk ?? false;
  const tierAllows = TIER_LIMITS[tier].streakRepair;

  function onBadgeClick() {
    setError(null);
    if (!status?.atRisk) return;
    if (!tierAllows) {
      setUpgradeOpen(true);
      return;
    }
    setConfirmOpen(true);
  }

  async function onRepair() {
    if (!workspaceId) return;
    setSubmitting(true);
    setError(null);
    try {
      const next = await repairStreak(workspaceId);
      if (mounted.current) {
        setStatus(next);
        setUser({ currentStreak: next.currentStreak, longestStreak: next.longestStreak });
        setConfirmOpen(false);
      }
    } catch {
      if (mounted.current) setError("Couldn't repair your streak. Please try again.");
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  }

  const eligible = status?.repairEligible ?? false;

  return (
    <>
      <StreakBadge
        streak={streak}
        size="sm"
        showZero
        atRisk={atRisk}
        onClick={atRisk ? onBadgeClick : undefined}
      />

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={eligible ? 'Repair your streak' : 'Streak repair used'}
      >
        {eligible ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              You missed a day. Repair your {streak}-day streak to keep it going? Uses your one
              repair for this month.
            </p>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
                Not now
              </Button>
              <Button variant="primary" loading={submitting} onClick={onRepair}>
                Repair
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              You've already used your streak repair this month. Your next repair unlocks next
              month.
            </p>
            <div className="flex justify-end">
              <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        initialTier="PRO"
        source="streak_repair"
      />
    </>
  );
}
