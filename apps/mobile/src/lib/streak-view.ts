// apps/mobile/src/lib/streak-view.ts
import type { ApiUser, StreakCalendar, StreakStatus, XpSummary } from '@finby/shared';

/** Fixed XP cost of a streak repair (mirrors the API). */
export const REPAIR_COST = 10;

export type StreakSheetState = 'new' | 'active' | 'recoverable' | 'missed';

/** Which sheet UI to show. `recoverable` needs BOTH repair-eligibility and
 *  enough XP; otherwise an at-risk streak is `missed`. */
export function streakSheetState(status: StreakStatus, xpBalance: number): StreakSheetState {
  if (status.currentStreak === 0) return 'new';
  if (!status.atRisk) return 'active';
  if (status.repairEligible && xpBalance >= REPAIR_COST) return 'recoverable';
  return 'missed';
}

export interface ShareCardStats {
  name: string;
  streak: number;
  best: number;
  xp: number;
  daysLogged: number;
}

/** Build the brag-card fields. `daysLogged` counts distinct dates across active +
 *  repaired days; `best` never reads below the current streak. */
export function shareCardStats(
  user: Pick<ApiUser, 'displayName'>,
  status: StreakStatus,
  xp: XpSummary,
  calendar: StreakCalendar,
): ShareCardStats {
  const days = new Set([...calendar.activeDays, ...calendar.repairedDays]);
  return {
    name: user.displayName,
    streak: status.currentStreak,
    best: Math.max(status.longestStreak, status.currentStreak),
    xp: xp.totalEarned,
    daysLogged: days.size,
  };
}

/** Group thousands with commas, no Intl dependency (Hermes-safe). */
export function formatXp(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
