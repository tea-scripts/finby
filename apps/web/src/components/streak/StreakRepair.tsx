'use client';

import { useEffect, useRef, useState } from 'react';
import { TIER_LIMITS } from '@finby/shared';
import { useAuth } from '@/lib/store';
import { getStreakStatus, repairStreak } from '@/lib/streaks-api';
import { streakCelebration } from '@/lib/streak-messages';
import { StreakBadge } from '@/components/streak/StreakBadge';
import { StreakCalendar } from '@/components/streak/StreakCalendar';
import { UpgradeModal } from '@/components/billing/UpgradeModal';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import type { StreakStatus } from '@/lib/types';

/** Header streak badge with repair + encouragement behaviour.
 *
 *  The count comes from the live auth store (kept current by login and by the
 *  chat page after each logged transaction) so it never goes stale; the fetched
 *  status only drives the at-risk / eligibility state, and is re-fetched
 *  whenever the streak count changes so the at-risk flag clears after a log.
 *
 *  Tapping the badge:
 *   - at risk, Pro+ eligible → confirm + repair, then a "log a transaction"
 *     nudge so the user knows how to keep the streak going;
 *   - at risk, Free → UpgradeModal;
 *   - at risk, already repaired this month → explanatory note;
 *   - safe → a congratulatory tooltip that varies by streak length. */
export function StreakRepair() {
  const user = useAuth((s) => s.user);
  const workspaceId = useAuth((s) => s.workspace?.id);
  const tier = useAuth((s) => s.workspace?.tier) ?? 'FREE';
  const setUser = useAuth((s) => s.setUser);

  const streakCount = user?.currentStreak ?? 0;

  const [status, setStatus] = useState<StreakStatus | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [repaired, setRepaired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Safe-streak encouragement tooltip.
  const [celebrateOpen, setCelebrateOpen] = useState(false);
  const [celebration, setCelebration] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Re-fetch when the workspace changes OR the streak count moves (e.g. a chat
  // log advanced it) so the at-risk flag reflects the latest activity.
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    getStreakStatus(workspaceId)
      .then((s) => {
        if (!cancelled && mounted.current) setStatus(s);
      })
      .catch(() => {
        /* ignore — the badge still shows the live store streak */
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, streakCount]);

  // Dismiss the encouragement tooltip on outside click / Escape.
  useEffect(() => {
    if (!celebrateOpen) return;
    function onDocPointer(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setCelebrateOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setCelebrateOpen(false);
    }
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [celebrateOpen]);

  const atRisk = status?.atRisk ?? false;
  const eligible = status?.repairEligible ?? false;
  const tierAllows = TIER_LIMITS[tier].streakRepair;

  function closeConfirm() {
    setConfirmOpen(false);
    setRepaired(false);
    setError(null);
  }

  function onBadgeClick() {
    setError(null);
    if (atRisk) {
      setCelebrateOpen(false);
      if (!tierAllows) {
        setUpgradeOpen(true);
        return;
      }
      setRepaired(false);
      setConfirmOpen(true);
      return;
    }
    // Safe streak → toggle the encouragement tooltip (fresh message each open).
    setCelebrateOpen((open) => {
      if (!open) setCelebration(streakCelebration(streakCount));
      return !open;
    });
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
        setRepaired(true);
      }
    } catch {
      if (mounted.current) setError("Couldn't repair your streak. Please try again.");
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  }

  const modalTitle = repaired
    ? 'Streak saved'
    : eligible
      ? 'Repair your streak'
      : 'Streak repair used';

  return (
    <>
      <span ref={wrapperRef} className="relative inline-flex">
        <StreakBadge
          streak={streakCount}
          size="sm"
          showZero
          atRisk={atRisk}
          onClick={onBadgeClick}
        />

        {celebrateOpen && (
          <div
            role="status"
            className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-line bg-surface-2 p-3 text-xs text-ink shadow-card"
          >
            {celebration}
            <button
              type="button"
              onClick={() => {
                setCelebrateOpen(false);
                setCalendarOpen(true);
              }}
              className="mt-2 text-xs font-medium text-accent hover:underline"
            >
              View calendar →
            </button>
          </div>
        )}
      </span>

      <Modal open={confirmOpen} onClose={closeConfirm} title={modalTitle}>
        {repaired ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              🎉 Your {streakCount}-day streak is saved. Log a transaction today to keep it
              going — adding any expense or income continues your streak.
            </p>
            <div className="flex justify-end">
              <Button variant="primary" onClick={closeConfirm}>
                Got it
              </Button>
            </div>
          </div>
        ) : eligible ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              You missed a day. Repair your {streakCount}-day streak to keep it going? Uses your
              one repair for this month — then log a transaction today to continue it.
            </p>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={closeConfirm}>
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
              <Button variant="ghost" onClick={closeConfirm}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={calendarOpen} onClose={() => setCalendarOpen(false)} title="Your streak">
        <StreakCalendar />
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
