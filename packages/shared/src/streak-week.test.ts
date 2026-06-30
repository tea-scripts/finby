import { describe, expect, it } from 'vitest';
import { isoWeekDays } from './streak-week';

describe('isoWeekDays', () => {
  it('returns Mon–Sun for a midweek date', () => {
    // 2026-06-30 is a Tuesday → Mon 06-29 .. Sun 07-05
    expect(isoWeekDays('2026-06-30')).toEqual([
      '2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05',
    ]);
  });
  it('treats Sunday as the end of its week', () => {
    expect(isoWeekDays('2026-07-05')[0]).toBe('2026-06-29');
    expect(isoWeekDays('2026-07-05')[6]).toBe('2026-07-05');
  });
});
