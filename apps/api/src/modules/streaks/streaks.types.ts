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

/** Error codes returned by the repair endpoint (HTTP 409). Consumed by
 *  StreaksService.repair + the controller (next task). */
export const STREAK_ERRORS = {
  NOT_AT_RISK: 'STREAK_NOT_AT_RISK',
  ALREADY_USED: 'STREAK_REPAIR_ALREADY_USED',
} as const;
