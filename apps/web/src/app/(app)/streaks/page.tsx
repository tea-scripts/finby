'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StreakCalendar } from '@/components/streak/StreakCalendar';
import { BadgeImage } from '@/features/gamification/components/BadgeImage';
import { WeekRow } from '@/features/gamification/components/WeekRow';
import { getStreakStatus, getStreakCalendar } from '@/lib/streaks-api';
import { getAchievements, getXpHistory, getXpSummary } from '@/lib/gamification-api';
import { relativeTime } from '@/lib/relative-time';
import { useAuth } from '@/lib/store';
import type {
  AchievementDefView,
  AchievementsResult,
  StreakCalendar as StreakCalendarData,
  StreakStatus,
  XpEvent,
  XpSummary,
  XpTransactionView,
} from '@/lib/types';

const XP_EVENT_LABELS: Record<XpEvent, string> = {
  STREAK_DAY: 'Streak maintained',
  STREAK_MILESTONE: 'Milestone bonus',
  TRANSACTION_LOGGED: 'Transaction logged',
  GOAL_HIT: 'Goal hit',
  STREAK_RECOVERY: 'Streak recovery (spent)',
  REFERRAL_BONUS: 'Referral bonus',
};

const CATEGORY_ORDER: Record<string, number> = { STREAK: 0, TRANSACTIONS: 1, GOALS: 2 };
const TIER_ORDER: Record<string, number> = { BRONZE: 0, SILVER: 1, GOLD: 2 };

function Stat({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface/60 p-4">
      <p className="text-2xl">{icon}</p>
      <p className="mt-1 text-lg font-semibold text-ink">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

export default function StreaksPage() {
  const router = useRouter();
  const workspaceId = useAuth((s) => s.workspace?.id);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StreakStatus | null>(null);
  const [calendar, setCalendar] = useState<StreakCalendarData | null>(null);
  const [xp, setXp] = useState<XpSummary | null>(null);
  const [history, setHistory] = useState<XpTransactionView[]>([]);
  const [achievements, setAchievements] = useState<AchievementsResult | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    let active = true;
    setLoading(true);
    Promise.all([
      getStreakStatus(workspaceId),
      getStreakCalendar(workspaceId),
      getXpSummary(workspaceId),
      getXpHistory(workspaceId),
      getAchievements(workspaceId),
    ])
      .then(([s, c, x, h, a]) => {
        if (!active) return;
        setStatus(s);
        setCalendar(c);
        setXp(x);
        setHistory(h);
        setAchievements(a);
      })
      .catch(() => {
        /* leave nulls — sections guard on their data */
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workspaceId]);

  const unlockedMap = new Map((achievements?.unlocked ?? []).map((u) => [u.achievementDef.slug, u]));
  const allAchievements: AchievementDefView[] = (() => {
    const defs = [
      ...(achievements?.unlocked.map((u) => u.achievementDef) ?? []),
      ...(achievements?.locked ?? []),
    ];
    const seen = new Set<string>();
    const out: AchievementDefView[] = [];
    for (const d of defs) {
      if (!seen.has(d.slug)) {
        seen.add(d.slug);
        out.push(d);
      }
    }
    out.sort(
      (a, b) =>
        (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99) ||
        (TIER_ORDER[a.tier] ?? 99) - (TIER_ORDER[b.tier] ?? 99),
    );
    return out;
  })();

  const totalLoggedDays = calendar ? calendar.activeDays.length + calendar.repairedDays.length : 0;

  return (
    <div className="h-full overflow-y-auto pb-nav">
      <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6 animate-fade-up">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-muted transition-colors hover:text-ink"
        >
          ← Back
        </button>

        {loading || !workspaceId ? (
          <p className="py-12 text-center text-sm text-muted">Loading your progress…</p>
        ) : (
          <>
            {/* Section 1: overview */}
            <div className="space-y-4 rounded-2xl border border-line bg-surface/60 p-5 shadow-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-4xl" aria-hidden="true">
                    🔥
                  </span>
                  <div>
                    <p className="text-3xl font-bold text-ink">{status?.currentStreak ?? 0}</p>
                    <p className="text-sm text-muted">day streak</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted">Best</p>
                  <p className="text-lg font-semibold text-ink">{status?.longestStreak ?? 0} days</p>
                </div>
              </div>
              {calendar && (
                <WeekRow
                  activeDays={calendar.activeDays}
                  repairedDays={calendar.repairedDays}
                  today={calendar.to}
                />
              )}
            </div>

            {/* Section 2: stats grid */}
            <div className="grid grid-cols-2 gap-4">
              <Stat icon="📅" value={String(totalLoggedDays)} label="Total days logged" />
              <Stat icon="🔥" value={`${status?.longestStreak ?? 0}`} label="Longest streak" />
              <Stat icon="⚡" value={`${xp?.totalEarned ?? 0} XP`} label="Total XP earned" />
              <Stat icon="💰" value={`${xp?.balance ?? 0} XP`} label="Available XP" />
            </div>

            {/* Section 3: calendar heatmap */}
            <section>
              <h2 className="mb-3 text-sm font-medium text-muted">Activity history</h2>
              <StreakCalendar />
            </section>

            {/* Section 4: achievements */}
            <section>
              <h2 className="mb-3 text-sm font-medium text-muted">Achievements</h2>
              <div className="grid grid-cols-3 gap-4">
                {allAchievements.map((def) => {
                  const unlocked = unlockedMap.get(def.slug);
                  const isUnlocked = Boolean(unlocked);
                  return (
                    <div key={def.slug} className="flex flex-col items-center gap-1 text-center">
                      <div className={`relative ${isUnlocked ? '' : 'opacity-40 grayscale'}`}>
                        <BadgeImage
                          workspaceId={workspaceId}
                          slug={def.slug}
                          alt={def.label}
                          className="h-16 w-16"
                        />
                        {!isUnlocked && (
                          <span
                            className="absolute inset-0 flex items-center justify-center text-base"
                            aria-label="Locked"
                          >
                            🔒
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-medium text-ink">{def.label}</p>
                      {isUnlocked && unlocked && (
                        <p className="text-xs text-muted">{relativeTime(unlocked.unlockedAt)}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Section 5: XP history */}
            <section>
              <h2 className="mb-3 text-sm font-medium text-muted">XP history</h2>
              {history.length === 0 ? (
                <p className="text-sm text-muted">No XP earned yet — log a transaction to get started.</p>
              ) : (
                <div className="flex flex-col divide-y divide-line">
                  {history.map((tx) => (
                    <div key={tx.id} className="flex justify-between py-3">
                      <div>
                        <p className="text-sm text-ink">{XP_EVENT_LABELS[tx.event] ?? tx.event}</p>
                        <p className="text-xs text-muted">{relativeTime(tx.createdAt)}</p>
                      </div>
                      <p
                        className={`text-sm font-medium ${tx.delta > 0 ? 'text-success' : 'text-danger'}`}
                      >
                        {tx.delta > 0 ? '+' : ''}
                        {tx.delta} XP
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
