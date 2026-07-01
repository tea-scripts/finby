import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FxService } from '../fx/fx.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { AnalyticsService } from './analytics.service';

function dec(v: string) {
  return new Prisma.Decimal(v);
}

describe('AnalyticsService.summary', () => {
  it('computes totals, net savings and savings rate from amountBase aggregates', async () => {
    const aggregate = jest
      .fn()
      .mockResolvedValueOnce({ _sum: { amountBase: dec('3200') } }) // income
      .mockResolvedValueOnce({ _sum: { amountBase: dec('1840') } }); // expense
    const count = jest.fn().mockResolvedValue(47);
    const prisma = { transaction: { aggregate, count } };
    const service = new AnalyticsService(prisma as unknown as PrismaService, {} as unknown as FxService, {} as unknown as PortfolioService);

    const result = await service.summary('w1', 'USD', '2026-06-01', '2026-06-30');

    expect(result.totalIncome).toBe('3200');
    expect(result.totalExpenses).toBe('1840');
    expect(result.netSavings).toBe('1360');
    expect(result.savingsRate).toBeCloseTo(42.5, 1);
    expect(result.transactionCount).toBe(47);
    expect(result.currency).toBe('USD');
  });

  it('reports a 0 savings rate when there is no income', async () => {
    const aggregate = jest
      .fn()
      .mockResolvedValueOnce({ _sum: { amountBase: null } })
      .mockResolvedValueOnce({ _sum: { amountBase: dec('500') } });
    const count = jest.fn().mockResolvedValue(2);
    const prisma = { transaction: { aggregate, count } };
    const service = new AnalyticsService(prisma as unknown as PrismaService, {} as unknown as FxService, {} as unknown as PortfolioService);

    const result = await service.summary('w1', 'USD', '2026-06-01', '2026-06-30');
    expect(result.totalIncome).toBe('0');
    expect(result.netSavings).toBe('-500');
    expect(result.savingsRate).toBe(0);
  });
});

describe('AnalyticsService.byCategory', () => {
  it('computes per-category totals and percentages', async () => {
    const groupBy = jest.fn().mockResolvedValue([
      { categoryId: 'c1', _sum: { amountBase: dec('420') }, _count: 12 },
      { categoryId: 'c2', _sum: { amountBase: dec('180') }, _count: 4 },
    ]);
    const findMany = jest.fn().mockResolvedValue([
      { id: 'c1', name: 'Groceries' },
      { id: 'c2', name: 'Dining' },
    ]);
    const prisma = { transaction: { groupBy }, category: { findMany } };
    const service = new AnalyticsService(prisma as unknown as PrismaService, {} as unknown as FxService, {} as unknown as PortfolioService);

    const result = await service.byCategory('w1', 'USD', '2026-06-01', '2026-06-30', 'EXPENSE');

    expect(result.breakdown).toHaveLength(2);
    const groceries = result.breakdown.find((b) => b.category.name === 'Groceries');
    expect(groceries?.total).toBe('420');
    expect(groceries?.percent).toBeCloseTo(70, 0); // 420 / 600
    expect(groceries?.transactionCount).toBe(12);
  });

  it('includes each category icon and color', async () => {
    const groupBy = jest.fn().mockResolvedValue([
      { categoryId: 'c1', _sum: { amountBase: dec('100') }, _count: 2 },
    ]);
    const findMany = jest.fn().mockResolvedValue([
      { id: 'c1', name: 'Groceries', icon: 'cart', color: '#1A7A4A' },
    ]);
    const prisma = { transaction: { groupBy }, category: { findMany } };
    const service = new AnalyticsService(prisma as unknown as PrismaService, {} as unknown as FxService, {} as unknown as PortfolioService);

    const result = await service.byCategory('w1', 'USD', '2026-07-01', '2026-07-31', 'EXPENSE');

    expect(result.breakdown[0]?.category).toEqual({
      id: 'c1',
      name: 'Groceries',
      icon: 'cart',
      color: '#1A7A4A',
    });
  });

  it('maps uncategorized spend with null icon and color', async () => {
    const groupBy = jest.fn().mockResolvedValue([
      { categoryId: null, _sum: { amountBase: dec('50') }, _count: 3 },
    ]);
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { transaction: { groupBy }, category: { findMany } };
    const service = new AnalyticsService(prisma as unknown as PrismaService, {} as unknown as FxService, {} as unknown as PortfolioService);

    const result = await service.byCategory('w1', 'USD', '2026-07-01', '2026-07-31', 'EXPENSE');

    expect(result.breakdown[0]?.category).toEqual({
      id: 'uncategorized',
      name: 'Uncategorized',
      icon: null,
      color: null,
    });
  });
});

describe('AnalyticsService.trend', () => {
  it('caps FREE tier to 3 months', async () => {
    const aggregate = jest.fn().mockResolvedValue({ _sum: { amountBase: null } });
    const prisma = { transaction: { aggregate } };
    const service = new AnalyticsService(prisma as unknown as PrismaService, {} as unknown as FxService, {} as unknown as PortfolioService);

    const result = await service.trend('w1', 'USD', 12, 'FREE');
    expect(result.trend).toHaveLength(3);
  });

  it('honors the requested months for PRO', async () => {
    const aggregate = jest.fn().mockResolvedValue({ _sum: { amountBase: null } });
    const prisma = { transaction: { aggregate } };
    const service = new AnalyticsService(prisma as unknown as PrismaService, {} as unknown as FxService, {} as unknown as PortfolioService);

    const result = await service.trend('w1', 'USD', 6, 'PRO');
    expect(result.trend).toHaveLength(6);
  });
});
