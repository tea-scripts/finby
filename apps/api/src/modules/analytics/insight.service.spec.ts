import { InsightService } from './insight.service';
import type { SummaryResult } from '@finby/shared';

function summary(over: Partial<SummaryResult>): SummaryResult {
  return {
    period: { from: '2026-07-01', to: '2026-07-15' },
    totalIncome: '0',
    totalExpenses: '0',
    netSavings: '0',
    savingsRate: 0,
    currency: 'USD',
    transactionCount: 0,
    ...over,
  };
}

describe('InsightService', () => {
  const NOW = new Date('2026-07-15T00:00:00.000Z'); // 15 days elapsed, July has 31 days

  function make(cur: SummaryResult, prev: SummaryResult) {
    const analytics = { summary: jest.fn() } as unknown as { summary: jest.Mock };
    analytics.summary.mockResolvedValueOnce(cur).mockResolvedValueOnce(prev);
    return new InsightService(analytics as never);
  }

  it('projects the current month and reports spending on pace vs last month', async () => {
    // spent 500 in 15 days → projected ~1033.33 for 31 days; last month spent 2000 → less
    const svc = make(
      summary({ totalExpenses: '500', netSavings: '500', transactionCount: 5 }),
      summary({ totalExpenses: '2000', transactionCount: 30 }),
    );
    const r = await svc.insight('ws1', 'USD', '2026-07-01', '2026-07-15', NOW);
    expect(r.projectionApplies).toBe(true);
    expect(r.direction).toBe('less');
    expect(Number(r.projectedSpend)).toBeCloseTo((500 * 31) / 15, 1);
    expect(Number(r.projectedSavings)).toBeCloseTo((500 * 31) / 15, 1);
    expect(r.spendDeltaPercent).toBeGreaterThan(0);
    expect(r.comparedTo).toEqual({ from: '2026-06-01', to: '2026-06-30' });
  });

  it('is retrospective (no projection) for a past month', async () => {
    const svc = make(
      summary({ totalExpenses: '1800', transactionCount: 20 }),
      summary({ totalExpenses: '2000', transactionCount: 25 }),
    );
    const r = await svc.insight('ws1', 'USD', '2026-05-01', '2026-05-31', NOW);
    expect(r.projectionApplies).toBe(false);
    expect(r.projectedSpend).toBeNull();
    expect(r.projectedSavings).toBeNull();
    expect(r.direction).toBe('less'); // 1800 < 2000
  });

  it('returns flat with a friendly message when there is no prior-month history', async () => {
    const svc = make(
      summary({ totalExpenses: '300', netSavings: '100', transactionCount: 3 }),
      summary({ totalExpenses: '0', transactionCount: 0 }),
    );
    const r = await svc.insight('ws1', 'USD', '2026-07-01', '2026-07-15', NOW);
    expect(r.direction).toBe('flat');
    expect(r.spendDeltaPercent).toBe(0);
    expect(r.message).toMatch(/not enough history/i);
  });
});
