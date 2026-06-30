import { describe, expect, it } from 'vitest';
import type { AchievementsResult } from './api-types';
import { sortAchievementDefs, xpEventLabel, XP_EVENT_LABELS } from './gamification-view';

const def = (slug: string, category: string, tier: string) =>
  ({ id: slug, slug, category, tier, threshold: 1, label: slug, description: '' });

describe('xpEventLabel', () => {
  it('maps known events and falls back to the raw event', () => {
    expect(xpEventLabel('DAILY_LOGIN')).toBe('Daily check-in');
    expect(XP_EVENT_LABELS.TRANSACTION_LOGGED).toBe('Transaction logged');
    expect(xpEventLabel('SOMETHING_NEW' as never)).toBe('SOMETHING_NEW');
  });
});

describe('sortAchievementDefs', () => {
  it('dedupes by slug and sorts by category then tier', () => {
    const result = {
      unlocked: [{ id: 'u1', unlockedAt: 'x', achievementDef: def('a', 'GOALS', 'GOLD') }],
      locked: [def('b', 'STREAK', 'SILVER'), def('c', 'STREAK', 'BRONZE'), def('a', 'GOALS', 'GOLD')],
    } as unknown as AchievementsResult;
    expect(sortAchievementDefs(result).map((d) => d.slug)).toEqual(['c', 'b', 'a']);
  });
});
