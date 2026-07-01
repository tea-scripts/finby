import { describe, expect, it } from 'vitest';
import { analyticsHistoryMonths, earliestAllowedMonthStart } from './analytics';

const JULY_2026 = new Date('2026-07-15T12:00:00.000Z');

describe('analyticsHistoryMonths', () => {
  it('caps FREE at 3 months and leaves paid tiers unlimited', () => {
    expect(analyticsHistoryMonths('FREE')).toBe(3);
    expect(analyticsHistoryMonths('PRO')).toBeNull();
    expect(analyticsHistoryMonths('PREMIUM')).toBeNull();
    expect(analyticsHistoryMonths('FAMILY')).toBeNull();
  });
});

describe('earliestAllowedMonthStart', () => {
  it('returns the first day of the month (N-1) months back for FREE', () => {
    // July 2026, 3 months → May 2026, June, July viewable → earliest = 2026-05-01
    expect(earliestAllowedMonthStart('FREE', JULY_2026)).toBe('2026-05-01');
  });

  it('returns null (no floor) for unlimited tiers', () => {
    expect(earliestAllowedMonthStart('PRO', JULY_2026)).toBeNull();
  });

  it('handles year boundaries', () => {
    // Feb 2026, 3 months → Dec 2025, Jan, Feb → earliest = 2025-12-01
    expect(earliestAllowedMonthStart('FREE', new Date('2026-02-10T00:00:00.000Z'))).toBe('2025-12-01');
  });
});
