import { describe, expect, it } from 'vitest';
import { parseISO, toISO, daysInMonth, firstWeekday } from './calendar';

describe('calendar', () => {
  it('parses and re-emits ISO without timezone drift', () => {
    expect(parseISO('2026-06-07')).toEqual({ y: 2026, m: 6, d: 7 });
    expect(parseISO('nope')).toBeNull();
    expect(toISO(2026, 6, 7)).toBe('2026-06-07');
    expect(toISO(2026, 12, 1)).toBe('2026-12-01');
  });

  it('counts days including a leap February', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 6)).toBe(30);
  });

  it('finds the weekday of the 1st (0=Sun)', () => {
    // 2026-06-01 is a Monday.
    expect(firstWeekday(2026, 6)).toBe(1);
  });
});
