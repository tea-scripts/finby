import type { AchievementTier } from '@prisma/client';

/** An achievement unlocked as a side effect of logging a transaction, surfaced
 *  to the client so it can celebrate immediately. */
export interface NewAchievement {
  slug: string;
  tier: AchievementTier;
  label: string;
  unlockedAt: Date;
}

/** Live streak status for the requesting user. */
export interface StreakStatusView {
  currentStreak: number;
  longestStreak: number;
  /** Exactly one day was missed (yesterday) and the streak isn't lost yet. */
  atRisk: boolean;
  /** atRisk && tier allows repair && not already repaired this month. */
  repairEligible: boolean;
  repairUsedThisMonth: boolean;
}

/** Error codes returned by the repair endpoint. NOT_AT_RISK is a 409 conflict;
 *  insufficient XP surfaces separately as a 400 from XpService.spendXp. */
export const STREAK_ERRORS = {
  NOT_AT_RISK: 'STREAK_NOT_AT_RISK',
} as const;

/** Calendar of streak activity over a window, derived from transaction history. */
export interface StreakCalendarView {
  /** Inclusive window start, local YYYY-MM-DD. */
  from: string;
  /** Inclusive window end (the user's local today), YYYY-MM-DD. */
  to: string;
  /** Local days with >=1 logged transaction. */
  activeDays: string[];
  /** Local days credited by a streak repair (latest repair if in window). */
  repairedDays: string[];
}
