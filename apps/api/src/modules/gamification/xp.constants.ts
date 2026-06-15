import { SubscriptionTier, XpEvent } from '@prisma/client';
import { TIER_LIMITS } from '@finby/shared';

/** Per-tier multiplier applied to every base XP award, sourced from the locked
 *  tier matrix so the API and web stay in lockstep. */
export const XP_MULTIPLIER: Record<SubscriptionTier, number> = {
  FREE: TIER_LIMITS.FREE.xpMultiplier,
  PRO: TIER_LIMITS.PRO.xpMultiplier,
  PREMIUM: TIER_LIMITS.PREMIUM.xpMultiplier,
  FAMILY: TIER_LIMITS.FAMILY.xpMultiplier,
};

/** Base XP granted by each earn event, before the tier multiplier. Spend-only
 *  events (recovery, referral placeholder) award nothing. */
export const XP_BASE: Record<XpEvent, number> = {
  STREAK_DAY: 1,
  STREAK_MILESTONE: 5,
  TRANSACTION_LOGGED: 1,
  GOAL_HIT: 2,
  STREAK_RECOVERY: 0,
  REFERRAL_BONUS: 0,
};

/** Fixed XP costs for spend actions. */
export const XP_COST = {
  STREAK_RECOVERY: 10,
} as const;

/** Streak lengths that trigger a one-off STREAK_MILESTONE bonus. */
export const STREAK_MILESTONES = new Set([7, 14, 30, 100, 200, 365]);
