import type { AchievementDefView, AchievementsResult, XpEvent } from './api-types';

/** Human labels for XP ledger events (shared by the web + mobile XP history). */
export const XP_EVENT_LABELS: Record<XpEvent, string> = {
  STREAK_DAY: 'Streak maintained',
  STREAK_MILESTONE: 'Milestone bonus',
  TRANSACTION_LOGGED: 'Transaction logged',
  GOAL_HIT: 'Goal hit',
  STREAK_RECOVERY: 'Streak recovery (spent)',
  REFERRAL_BONUS: 'Referral bonus',
  DAILY_LOGIN: 'Daily check-in',
};

export function xpEventLabel(event: XpEvent): string {
  return XP_EVENT_LABELS[event] ?? event;
}

const CATEGORY_ORDER: Record<string, number> = { STREAK: 0, TRANSACTIONS: 1, GOALS: 2 };
const TIER_ORDER: Record<string, number> = { BRONZE: 0, SILVER: 1, GOLD: 2 };

/** Merge unlocked + locked achievement defs, dedupe by slug, and sort by
 *  category then tier — the display order for the achievements grid. */
export function sortAchievementDefs(result: AchievementsResult): AchievementDefView[] {
  const defs = [...result.unlocked.map((u) => u.achievementDef), ...result.locked];
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
}
