import { describe, expect, it } from 'vitest';
import { groupByDay, presetRange, activeFilterCount } from './transactions-view';
import type { Transaction } from '@finby/shared';

function tx(id: string, date: string): Transaction {
  return {
    id, type: 'EXPENSE', status: 'CONFIRMED', amountOriginal: '1.00', currencyOriginal: 'USD',
    amountBase: '1.00', currencyBase: 'USD', fxRateUsed: '1', merchant: id, description: null,
    category: null, account: null, transactionDate: date, tags: [], aiConfidence: null,
    loggedByUserId: 'u1', createdAt: date,
  };
}

describe('groupByDay', () => {
  it('groups consecutive same-day items, preserving order', () => {
    const sections = groupByDay([
      tx('a', '2026-06-20T10:00:00.000Z'),
      tx('b', '2026-06-20T08:00:00.000Z'),
      tx('c', '2026-06-19T08:00:00.000Z'),
    ]);
    expect(sections).toHaveLength(2);
    expect(sections[0].data.map((t) => t.id)).toEqual(['a', 'b']);
    expect(sections[1].data.map((t) => t.id)).toEqual(['c']);
  });
});

describe('presetRange', () => {
  const now = new Date('2026-06-25T12:00:00.000Z');
  it('LAST_90 spans 90 days back to today', () => {
    expect(presetRange('LAST_90', now)).toEqual({ fromDate: '2026-03-27', toDate: '2026-06-25' });
  });
  it('ALL clears the range', () => {
    expect(presetRange('ALL', now)).toEqual({});
  });
  it('LAST_MONTH spans the previous calendar month', () => {
    expect(presetRange('LAST_MONTH', now)).toEqual({ fromDate: '2026-05-01', toDate: '2026-05-31' });
  });
});

describe('activeFilterCount', () => {
  it('counts category, currency and date filters (not type)', () => {
    expect(activeFilterCount({ type: 'EXPENSE' })).toBe(0);
    expect(activeFilterCount({ categoryId: 'c1', currency: 'USD' })).toBe(2);
    expect(activeFilterCount({ fromDate: '2026-06-01', toDate: '2026-06-30' })).toBe(1);
  });
});
