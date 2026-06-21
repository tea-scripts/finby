import { computeStreakFromActiveDays } from './streaks.recompute';

describe('computeStreakFromActiveDays', () => {
  it('returns zeros for no active days', () => {
    expect(computeStreakFromActiveDays([])).toEqual({
      currentStreak: 0,
      longestStreak: 0,
      lastStreakDate: null,
    });
  });

  it('counts a single consecutive run', () => {
    const r = computeStreakFromActiveDays(['2026-06-16', '2026-06-17', '2026-06-18']);
    expect(r).toEqual({ currentStreak: 3, longestStreak: 3, lastStreakDate: '2026-06-18' });
  });

  it('current run ends at the most recent day; longest can be earlier', () => {
    // 4-day run (Jun 1-4), gap, then 2-day run (Jun 10-11)
    const r = computeStreakFromActiveDays([
      '2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04',
      '2026-06-10', '2026-06-11',
    ]);
    expect(r).toEqual({ currentStreak: 2, longestStreak: 4, lastStreakDate: '2026-06-11' });
  });

  it('dedupes and is order-independent', () => {
    const r = computeStreakFromActiveDays(['2026-06-18', '2026-06-17', '2026-06-18']);
    expect(r).toEqual({ currentStreak: 2, longestStreak: 2, lastStreakDate: '2026-06-18' });
  });

  it('a restored day that bridges two runs joins them', () => {
    // Jun 1-2, [Jun 3 restored], Jun 4-5  → one run of 5
    const r = computeStreakFromActiveDays([
      '2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05',
    ]);
    expect(r).toEqual({ currentStreak: 5, longestStreak: 5, lastStreakDate: '2026-06-05' });
  });
});
