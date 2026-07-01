import { describe, expect, it } from 'vitest';
import { money, shortDate, addMonths, currentMonth, formatMonthLabel, monthToRange } from './format';

// A fixed UTC instant used across date assertions: 7 June 2026.
const ISO = '2026-06-07T00:00:00.000Z';

describe('shortDate', () => {
  it('MEDIUM (default) is byte-identical to the historical output', () => {
    // Historical: toLocaleDateString({ month:'short', day:'numeric', year:'numeric' }).
    expect(shortDate(ISO)).toBe('Jun 7, 2026');
    expect(shortDate(ISO, 'MEDIUM')).toBe('Jun 7, 2026');
  });

  it('SHORT renders DD/MM/YYYY (day-first)', () => {
    expect(shortDate(ISO, 'SHORT')).toBe('07/06/2026');
  });

  it('ISO renders YYYY-MM-DD', () => {
    expect(shortDate(ISO, 'ISO')).toBe('2026-06-07');
  });

  it('falls back to the first 10 chars for an unparseable input', () => {
    expect(shortDate('2026-13-99-garbage')).toBe('2026-13-99');
  });
});

describe('money', () => {
  it('defaults (SYMBOL + GROUPED) render the currency symbol prefix', () => {
    // SYMBOL resolves the symbol from CURRENCIES → "$1,234.50".
    expect(money('1234.5', 'USD')).toBe('$1,234.50');
    expect(money('1234.5', 'USD', { display: 'SYMBOL', grouping: 'GROUPED' })).toBe('$1,234.50');
  });

  it('CODE renders the grouped number then the code suffix (historical form)', () => {
    expect(money('1234.5', 'USD', { display: 'CODE' })).toBe('1,234.50 USD');
    expect(money('1234.5', 'USD', { display: 'CODE', grouping: 'GROUPED' })).toBe('1,234.50 USD');
  });

  it('PLAIN drops thousands separators', () => {
    expect(money('1234.5', 'USD', { grouping: 'PLAIN' })).toBe('$1234.50');
    expect(money('1234.5', 'USD', { display: 'CODE', grouping: 'PLAIN' })).toBe('1234.50 USD');
  });

  it('falls back to the CODE form for a currency with no known symbol', () => {
    expect(money('1234.5', 'XYZ')).toBe('1,234.50 XYZ');
  });

  it('resolves non-USD symbols from CURRENCIES', () => {
    expect(money('1000', 'PHP')).toBe('₱1,000.00');
  });

  it('passes a non-numeric amount through unformatted', () => {
    expect(money('NaN-ish', 'USD')).toBe('$NaN-ish');
  });
});

describe('month helpers', () => {
  const JUL = new Date('2026-07-15T00:00:00.000Z');

  it('currentMonth returns 0-based month', () => {
    expect(currentMonth(JUL)).toEqual({ year: 2026, month: 6 });
  });

  it('addMonths rolls across year boundaries', () => {
    expect(addMonths({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(addMonths({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
  });

  it('monthToRange caps the current month at today, past months at month end', () => {
    expect(monthToRange({ year: 2026, month: 6 }, JUL)).toEqual({ from: '2026-07-01', to: '2026-07-15' });
    expect(monthToRange({ year: 2026, month: 4 }, JUL)).toEqual({ from: '2026-05-01', to: '2026-05-31' });
  });

  it('formatMonthLabel always shows the month and year (unambiguous across years)', () => {
    expect(formatMonthLabel({ year: 2026, month: 6 })).toBe('July 2026');
    expect(formatMonthLabel({ year: 2025, month: 4 })).toBe('May 2025');
    expect(formatMonthLabel({ year: 2027, month: 0 })).toBe('January 2027');
  });
});
