'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { getStreakStatus, repairStreak, getStreakCalendar } from '@/lib/streaks-api';
import { getXpSummary } from '@/lib/gamification-api';
import { enablePush } from '@/lib/push';
import { toast } from '@/lib/toast';
import { useAuth } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BadgeImage } from './BadgeImage';
import { WeekRow } from './WeekRow';
import type { NewAchievement, StreakCalendar, StreakStatus, XpSummary } from '@/lib/types';

type StreakSheetState = 'new-user' | 'active' | 'recoverable' | 'missed' | 'milestone';

const RECOVERY_COST = 10;

interface StreakSheetProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  milestoneAchievements?: NewAchievement[];
}

/** Copy for the active state, by streak length. */
function activeCopy(streak: number): { title: string; sub: string } {
  if (streak >= 100) return { title: 'Legendary 👑', sub: "You're in the top 1%." };
  if (streak >= 30) return { title: 'One month streak 🏆', sub: "You're unstoppable." };
  if (streak >= 14) return { title: 'Two weeks in 🚀', sub: 'The habit is forming.' };
  if (streak >= 7) return { title: 'One week strong! 🔥', sub: "You're in the top 20% of users." };
  return { title: 'Building the habit 💪', sub: 'Log again tomorrow to keep it going.' };
}

export function StreakSheet({ open, onClose, workspaceId, milestoneAchievements }: StreakSheetProps) {
  const setUser = useAuth((s) => s.setUser);

  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StreakStatus | null>(null);
  const [xp, setXp] = useState<XpSummary | null>(null);
  const [calendar, setCalendar] = useState<StreakCalendar | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [milestoneDismissed, setMilestoneDismissed] = useState(false);

  useEffect(() => setMounted(true), []);

  // Fetch streak status, XP, and the calendar (for the week row) on open.
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setMilestoneDismissed(false);
    Promise.all([getStreakStatus(workspaceId), getXpSummary(workspaceId), getStreakCalendar(workspaceId)])
      .then(([s, x, c]) => {
        if (!active) return;
        setStatus(s);
        setXp(x);
        setCalendar(c);
      })
      .catch(() => {
        /* leave nulls — the shell still renders with safe fallbacks */
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, workspaceId]);

  // Escape to close + lock background scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const streak = status?.currentStreak ?? 0;
  const atRisk = status?.atRisk ?? false;
  const balance = xp?.balance ?? 0;
  const hasMilestone = (milestoneAchievements?.length ?? 0) > 0 && !milestoneDismissed;

  const state: StreakSheetState = hasMilestone
    ? 'milestone'
    : atRisk && balance >= RECOVERY_COST
      ? 'recoverable'
      : atRisk
        ? 'missed'
        : streak === 0
          ? 'new-user'
          : 'active';

  async function onRepair() {
    setRepairing(true);
    try {
      const next = await repairStreak(workspaceId);
      setStatus(next);
      setUser({ currentStreak: next.currentStreak, longestStreak: next.longestStreak });
      const x = await getXpSummary(workspaceId);
      setXp(x);
    } catch {
      toast.error("Couldn't recover your streak", 'Please try again.');
    } finally {
      setRepairing(false);
    }
  }

  async function onEnableNotifications() {
    setEnabling(true);
    try {
      await enablePush(workspaceId);
    } finally {
      setEnabling(false);
    }
  }

  async function onShare(message: string) {
    const url = 'https://chat.finby.app';
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ title: `${streak}-day streak on Finby!`, text: message, url });
      } else {
        await navigator.clipboard.writeText(`${message} ${url}`);
        toast.success('Copied!');
      }
    } catch {
      /* user dismissed the share sheet — nothing to do */
    }
  }

  const milestone = milestoneAchievements?.[0];

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas" role="dialog" aria-modal="true" aria-label="Streak">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-full px-2 py-1 text-lg text-muted transition hover:text-ink"
        >
          ←
        </button>
        <span />
        <span />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-6 pb-10">
        {loading ? (
          <div className="flex w-full max-w-sm flex-col items-center gap-6">
            <Skeleton className="h-20 w-20 rounded-full" />
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-24 w-full rounded-2xl" />
          </div>
        ) : (
          <>
            {/* Hero */}
            {state === 'milestone' && milestone ? (
              <BadgeImage workspaceId={workspaceId} slug={milestone.slug} alt={milestone.label} className="h-40 w-40" />
            ) : (
              <div className="flex flex-col items-center">
                <span className="text-7xl leading-none" aria-hidden="true">
                  🔥
                </span>
                <p className="mt-4 text-7xl font-bold text-ink">{streak}</p>
                <p className="text-xl text-muted">days streak</p>
              </div>
            )}

            {/* Week row */}
            {calendar && state !== 'milestone' && (
              <WeekRow activeDays={calendar.activeDays} repairedDays={calendar.repairedDays} today={calendar.to} />
            )}

            {/* State-specific card */}
            {state === 'new-user' && (
              <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
                <p className="text-lg font-semibold text-ink">Day one — every streak starts here. 🔥</p>
                <p className="text-sm text-muted">Log a transaction to light your first flame.</p>
                <Button variant="primary" loading={enabling} onClick={onEnableNotifications}>
                  Enable notifications
                </Button>
              </div>
            )}

            {state === 'active' &&
              (() => {
                const copy = activeCopy(streak);
                return (
                  <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
                    <p className="text-lg font-semibold text-ink">{copy.title}</p>
                    <p className="text-sm text-muted">{copy.sub}</p>
                    <Button
                      variant="primary"
                      onClick={() =>
                        void onShare(`I'm on a ${streak}-day financial logging streak on Finby.`)
                      }
                    >
                      Share your streak
                    </Button>
                  </div>
                );
              })()}

            {state === 'recoverable' && (
              <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
                <p className="text-lg font-semibold text-ink">You missed yesterday 😬</p>
                <p className="text-sm text-muted">Spend {RECOVERY_COST} XP to restore your {streak}-day streak.</p>
                <p className="text-xs text-muted">Your balance: {balance} XP</p>
                <button
                  type="button"
                  onClick={() => void onRepair()}
                  disabled={repairing}
                  className="inline-flex items-center justify-center rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-400 disabled:opacity-60"
                >
                  {repairing ? 'Recovering…' : `Recover streak — ${RECOVERY_COST} XP`}
                </button>
              </div>
            )}

            {state === 'missed' && (
              <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
                <p className="text-lg font-semibold text-ink">You missed yesterday 😬</p>
                <p className="text-sm text-muted">
                  You need {RECOVERY_COST} XP to recover. Keep logging to earn more.
                </p>
                <button
                  type="button"
                  disabled
                  className="inline-flex cursor-not-allowed items-center justify-center rounded-xl bg-surface-2 px-4 py-2.5 text-sm font-semibold text-faint"
                >
                  Recover streak ({RECOVERY_COST} XP)
                </button>
                <p className="text-xs text-muted">
                  You have {balance} XP — need {Math.max(0, RECOVERY_COST - balance)} more.
                </p>
              </div>
            )}

            {state === 'milestone' && milestone && (
              <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
                <p className="text-2xl font-bold text-ink">{streak} days streak!</p>
                <p className="text-sm text-muted">You&apos;ve unlocked: {milestone.label}</p>
                <div className="flex flex-col items-center gap-2">
                  <Button variant="primary" onClick={() => setMilestoneDismissed(true)}>
                    Continue
                  </Button>
                  <button
                    type="button"
                    onClick={() => void onShare(`I just unlocked "${milestone.label}" on Finby!`)}
                    className="text-sm text-muted transition-colors hover:text-ink"
                  >
                    Share this badge
                  </button>
                </div>
              </div>
            )}

            {/* XP summary card */}
            {state !== 'new-user' && state !== 'milestone' && (
              <div className="flex w-full max-w-sm justify-between rounded-2xl border border-line bg-surface p-4">
                <div>
                  <p className="text-xs text-muted">Today</p>
                  <p className="text-lg font-semibold text-ink">+{xp?.todayEarned ?? 0} XP</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted">Total</p>
                  <p className="text-lg font-semibold text-ink">{balance} XP</p>
                </div>
              </div>
            )}

            {state !== 'milestone' && (
              <Link
                href="/streaks"
                onClick={onClose}
                className="text-sm text-muted transition-colors hover:text-ink"
              >
                See full history →
              </Link>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
