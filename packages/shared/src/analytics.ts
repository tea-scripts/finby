import { TIER_LIMITS } from './constants';
import type { SubscriptionTier } from './types';

/** How many months of dashboard history a tier may view. null = unlimited.
 *  Mirrors the trend cap so dashboard/trend/history stay consistent (do not
 *  hardcode the number here — it derives from the tier matrix). */
export function analyticsHistoryMonths(tier: SubscriptionTier): number | null {
  return TIER_LIMITS[tier].analyticsTrendMonths;
}

/** First day (YYYY-MM-DD, UTC) of the earliest month a tier may view, or null
 *  when unlimited. FREE (3 months) in July 2026 → '2026-05-01'. */
export function earliestAllowedMonthStart(
  tier: SubscriptionTier,
  now: Date = new Date(),
): string | null {
  const months = analyticsHistoryMonths(tier);
  if (months === null) return null;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  return start.toISOString().slice(0, 10);
}
