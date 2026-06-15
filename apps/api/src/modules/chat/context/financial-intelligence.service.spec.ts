import { AnalyticsService } from '../../analytics/analytics.service';
import { BudgetsService } from '../../budgets/budgets.service';
import { FinancialIntelligenceService } from './financial-intelligence.service';

type SummaryOverride = Partial<{
  totalIncome: string;
  totalExpenses: string;
  netSavings: string;
  savingsRate: number;
}>;

function summaryVal(over: SummaryOverride = {}) {
  return {
    period: { from: '', to: '' },
    totalIncome: '1000',
    totalExpenses: '500',
    netSavings: '500',
    savingsRate: 50,
    currency: 'USD',
    transactionCount: 0,
    ...over,
  };
}

function categoryRow(name: string, total: string) {
  return { category: { id: name, name }, total, percent: 0, transactionCount: 0 };
}

function makeMocks() {
  const analytics = {
    summary: jest.fn().mockResolvedValue(summaryVal()),
    byCategory: jest.fn().mockResolvedValue({ breakdown: [], currency: 'USD' }),
    topMerchants: jest.fn().mockResolvedValue({ merchants: [], currency: 'USD' }),
  };
  const budgets = { list: jest.fn().mockResolvedValue([]) };
  const service = new FinancialIntelligenceService(
    analytics as unknown as AnalyticsService,
    budgets as unknown as BudgetsService,
  );
  return { service, analytics, budgets };
}

describe('FinancialIntelligenceService.computeSignals — spending anomalies', () => {
  it('flags categories >= 1.5x avg, skips no-history categories, sorts by multiplier desc', async () => {
    const { service, analytics } = makeMocks();
    analytics.byCategory
      .mockResolvedValueOnce({
        breakdown: [
          categoryRow('Transport', '4100'), // 4100 / (6900/3=2300) = 1.78x
          categoryRow('Dining', '8200'), // 8200 / (11700/3=3900) = 2.1x
          categoryRow('Groceries', '3000'), // 3000 / (9000/3=3000) = 1.0x — below threshold
          categoryRow('Rent', '10000'), // no 3-month history — skipped
        ],
        currency: 'USD',
      })
      .mockResolvedValueOnce({
        // 3-month baseline: trailing months only, ending at last-month-end (the
        // current month is excluded so a spike this month isn't averaged in).
        breakdown: [
          categoryRow('Dining', '11700'),
          categoryRow('Transport', '6900'),
          categoryRow('Groceries', '9000'),
        ],
        currency: 'USD',
      });

    const result = await service.computeSignals('w1', 'USD', 'PRO');

    // The baseline byCategory call must end before the current-month call (i.e. at
    // last-month-end, not current-month-end) — verifies the corrected range.
    expect(analytics.byCategory).toHaveBeenCalledTimes(2);
    const currentTo = analytics.byCategory.mock.calls[0]?.[3];
    const baselineTo = analytics.byCategory.mock.calls[1]?.[3];
    expect(typeof currentTo).toBe('string');
    expect(typeof baselineTo).toBe('string');
    expect(String(baselineTo) < String(currentTo)).toBe(true);

    expect(result.spendingAnomalies.map((a) => a.category)).toEqual(['Dining', 'Transport']);
    const dining = result.spendingAnomalies.find((a) => a.category === 'Dining');
    const transport = result.spendingAnomalies.find((a) => a.category === 'Transport');
    expect(dining?.multiplier ?? 0).toBeCloseTo(2.1, 1);
    expect(dining?.threeMonthAverage ?? 0).toBeCloseTo(3900, 0);
    expect(transport?.multiplier ?? 0).toBeCloseTo(1.8, 1);
    expect(result.spendingAnomalies.some((a) => a.category === 'Rent')).toBe(false);
    expect(result.spendingAnomalies.some((a) => a.category === 'Groceries')).toBe(false);
  });
});

describe('FinancialIntelligenceService.computeSignals — savings velocity', () => {
  it('computes the delta between current and last-month savings rates', async () => {
    const { service, analytics } = makeMocks();
    analytics.summary
      .mockResolvedValueOnce(summaryVal({ totalIncome: '50000', savingsRate: 20 }))
      .mockResolvedValueOnce(summaryVal({ totalIncome: '40000', savingsRate: 15 }));

    const result = await service.computeSignals('w1', 'USD', 'PRO');

    expect(result.savingsVelocityDelta).toBeCloseTo(5, 5);
  });

  it('returns null when either month has zero income', async () => {
    const { service, analytics } = makeMocks();
    analytics.summary
      .mockResolvedValueOnce(summaryVal({ totalIncome: '0', savingsRate: 0 }))
      .mockResolvedValueOnce(summaryVal({ totalIncome: '40000', savingsRate: 15 }));

    const result = await service.computeSignals('w1', 'USD', 'PRO');

    expect(result.savingsVelocityDelta).toBeNull();
  });
});

describe('FinancialIntelligenceService.computeSignals — top merchants', () => {
  it('maps analytics merchants to {name,total,visits} and caps at 5', async () => {
    const { service, analytics } = makeMocks();
    analytics.topMerchants.mockResolvedValue({
      merchants: Array.from({ length: 7 }, (_, i) => ({
        merchant: `M${i}`,
        total: `${(i + 1) * 100}`,
        transactionCount: i + 1,
      })),
      currency: 'USD',
    });

    const result = await service.computeSignals('w1', 'USD', 'PRO');

    expect(result.topMerchants).toHaveLength(5);
    expect(result.topMerchants[0]).toEqual({ name: 'M0', total: 100, visits: 1 });
  });
});

describe('FinancialIntelligenceService.computeSignals — resilience', () => {
  it('never throws and returns empty defaults when analytics fails', async () => {
    const { service, analytics } = makeMocks();
    analytics.summary.mockRejectedValue(new Error('db down'));

    const result = await service.computeSignals('w1', 'USD', 'FREE');

    expect(result).toEqual({
      spendingAnomalies: [],
      burnRateForecasts: [],
      savingsVelocityDelta: null,
      topMerchants: [],
      currentMonthSummary: { totalIncome: 0, totalExpenses: 0, netSavings: 0, savingsRate: 0 },
    });
  });
});

describe('FinancialIntelligenceService.computeSignals — parallel fetch', () => {
  it('issues all analytics + budget fetches concurrently, not sequentially', async () => {
    const { service, analytics, budgets } = makeMocks();
    let active = 0;
    let maxActive = 0;
    const gate =
      <T>(value: T) =>
      () =>
        new Promise<T>((resolve) => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          setTimeout(() => {
            active -= 1;
            resolve(value);
          }, 5);
        });

    analytics.summary.mockImplementation(gate(summaryVal()));
    analytics.byCategory.mockImplementation(gate({ breakdown: [], currency: 'USD' }));
    analytics.topMerchants.mockImplementation(gate({ merchants: [], currency: 'USD' }));
    budgets.list.mockImplementation(gate([]));

    await service.computeSignals('w1', 'USD', 'PRO');

    // All 6 fetches (2 summary, 2 byCategory, 1 topMerchants, 1 budgets) overlap.
    expect(maxActive).toBeGreaterThanOrEqual(5);
    expect(analytics.summary).toHaveBeenCalledTimes(2);
    expect(analytics.byCategory).toHaveBeenCalledTimes(2);
    expect(analytics.topMerchants).toHaveBeenCalledTimes(1);
    expect(budgets.list).toHaveBeenCalledTimes(1);
  });
});
