import { AnalyticsService } from './analytics.service';
import { BudgetsService } from '../budgets/budgets.service';
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
      // current month
      .mockResolvedValueOnce({
        breakdown: [
          categoryRow('Transport', '4100'), // 4100 / 2300 = 1.78x
          categoryRow('Dining', '8200'), // 8200 / 3900 = 2.1x
          categoryRow('Groceries', '3000'), // 3000 / 3000 = 1.0x — below threshold
          categoryRow('Rent', '10000'), // no prior history — skipped
        ],
        currency: 'USD',
      })
      // 3 prior whole months (each queried separately) — every category present in
      // all three, so observedMonths = 3 and average = total / 3.
      .mockResolvedValue({
        breakdown: [
          categoryRow('Dining', '3900'),
          categoryRow('Transport', '2300'),
          categoryRow('Groceries', '3000'),
        ],
        currency: 'USD',
      });

    const result = await service.computeSignals('w1', 'USD', 'PRO');

    // Now 4 byCategory calls: 1 current + 3 prior months.
    expect(analytics.byCategory).toHaveBeenCalledTimes(4);
    // The first prior-month call must end before the current-month call.
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
    expect(dining?.observedMonths).toBe(3);
    expect(transport?.multiplier ?? 0).toBeCloseTo(1.8, 1);
    expect(result.spendingAnomalies.some((a) => a.category === 'Rent')).toBe(false);
    expect(result.spendingAnomalies.some((a) => a.category === 'Groceries')).toBe(false);
  });

  it('does NOT flag a category with only 1 observed baseline month', async () => {
    const { service, analytics } = makeMocks();
    analytics.byCategory
      .mockResolvedValueOnce({ breakdown: [categoryRow('Coffee', '5000')], currency: 'USD' }) // current
      .mockResolvedValueOnce({ breakdown: [categoryRow('Coffee', '1000')], currency: 'USD' }) // prior1
      .mockResolvedValueOnce({ breakdown: [], currency: 'USD' }) // prior2
      .mockResolvedValueOnce({ breakdown: [], currency: 'USD' }); // prior3

    const result = await service.computeSignals('w1', 'USD', 'PRO');

    // 5000/1000 = 5x, but only 1 observed month (< MIN_BASELINE_MONTHS) → skipped.
    expect(result.spendingAnomalies).toHaveLength(0);
  });

  it('divides by observed months, not a fixed 3 (2 months → /2)', async () => {
    const { service, analytics } = makeMocks();
    analytics.byCategory
      .mockResolvedValueOnce({ breakdown: [categoryRow('Travel', '6000')], currency: 'USD' }) // current
      .mockResolvedValueOnce({ breakdown: [categoryRow('Travel', '2000')], currency: 'USD' }) // prior1
      .mockResolvedValueOnce({ breakdown: [categoryRow('Travel', '2000')], currency: 'USD' }) // prior2
      .mockResolvedValueOnce({ breakdown: [], currency: 'USD' }); // prior3 — no spend

    const result = await service.computeSignals('w1', 'USD', 'PRO');

    const travel = result.spendingAnomalies.find((a) => a.category === 'Travel');
    // avg = 4000 / 2 = 2000 (not 4000/3 = 1333); multiplier = 6000 / 2000 = 3.0.
    expect(travel?.observedMonths).toBe(2);
    expect(travel?.threeMonthAverage ?? 0).toBeCloseTo(2000, 0);
    expect(travel?.multiplier ?? 0).toBeCloseTo(3.0, 1);
  });

  it('does NOT flag current amounts below MIN_ANOMALY_AMOUNT', async () => {
    const { service, analytics } = makeMocks();
    analytics.byCategory
      .mockResolvedValueOnce({ breakdown: [categoryRow('Tips', '50')], currency: 'USD' }) // current < 100
      .mockResolvedValueOnce({ breakdown: [categoryRow('Tips', '10')], currency: 'USD' })
      .mockResolvedValueOnce({ breakdown: [categoryRow('Tips', '10')], currency: 'USD' })
      .mockResolvedValueOnce({ breakdown: [], currency: 'USD' });

    const result = await service.computeSignals('w1', 'USD', 'PRO');

    // 50/10 = 5x, but 50 < MIN_ANOMALY_AMOUNT (100) → skipped.
    expect(result.spendingAnomalies).toHaveLength(0);
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

    // All 8 fetches (2 summary, 4 byCategory [1 current + 3 prior], 1 topMerchants,
    // 1 budgets) overlap.
    expect(maxActive).toBeGreaterThanOrEqual(7);
    expect(analytics.summary).toHaveBeenCalledTimes(2);
    expect(analytics.byCategory).toHaveBeenCalledTimes(4);
    expect(analytics.topMerchants).toHaveBeenCalledTimes(1);
    expect(budgets.list).toHaveBeenCalledTimes(1);
  });
});
