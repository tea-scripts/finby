// apps/mobile/src/lib/streak-view.test.ts
import { describe, expect, it } from 'vitest';
import type { StreakStatus, StreakCalendar, XpSummary } from '@finby/shared';
import { REPAIR_COST, formatXp, shareCardStats, streakSheetState } from './streak-view';

const status = (over: Partial<StreakStatus> = {}): StreakStatus => ({
  currentStreak: 5, longestStreak: 10, atRisk: false, repairEligible: false, repairUsedThisMonth: false, ...over,
});

describe('streakSheetState', () => {
  it('is "new" at zero streak', () => {
    expect(streakSheetState(status({ currentStreak: 0 }), 100)).toBe('new');
  });
  it('is "active" when streak > 0 and not at risk', () => {
    expect(streakSheetState(status({ atRisk: false }), 0)).toBe('active');
  });
  it('is "recoverable" only when at risk, eligible, and balance >= cost', () => {
    expect(streakSheetState(status({ atRisk: true, repairEligible: true }), REPAIR_COST)).toBe('recoverable');
  });
  it('is "missed" when at risk but balance below cost', () => {
    expect(streakSheetState(status({ atRisk: true, repairEligible: true }), REPAIR_COST - 1)).toBe('missed');
  });
  it('is "missed" when at risk but not repair-eligible', () => {
    expect(streakSheetState(status({ atRisk: true, repairEligible: false }), 999)).toBe('missed');
  });
});

describe('shareCardStats', () => {
  it('builds the brag-card fields and counts distinct logged days', () => {
    const cal: StreakCalendar = {
      from: '2026-01-01', to: '2026-06-30',
      activeDays: ['2026-06-29', '2026-06-30'], repairedDays: ['2026-06-30', '2026-06-28'],
    };
    const xp: XpSummary = { balance: 40, totalEarned: 1250, todayEarned: 10 };
    const stats = shareCardStats({ displayName: 'Timilehin' } as never, status({ currentStreak: 30, longestStreak: 12 }), xp, cal);
    expect(stats).toEqual({ name: 'Timilehin', streak: 30, best: 30, xp: 1250, daysLogged: 3 });
  });
});

describe('formatXp', () => {
  it('groups thousands', () => {
    expect(formatXp(1250)).toBe('1,250');
    expect(formatXp(0)).toBe('0');
    expect(formatXp(1000000)).toBe('1,000,000');
  });
});
