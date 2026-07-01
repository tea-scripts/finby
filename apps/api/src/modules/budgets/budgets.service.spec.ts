import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BudgetsService } from './budgets.service';

function buildPrisma() {
  const budget = {
    upsert: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  return {
    budget,
    // Interactive transaction: hand the same client to the callback.
    $transaction: jest.fn((fn: (tx: { budget: typeof budget }) => unknown) => fn({ budget })),
  };
}

const budgetRow = (extra: Record<string, unknown> = {}) => ({
  id: 'b1',
  amountLimit: new Prisma.Decimal('15000'),
  amountSpent: new Prisma.Decimal('9800'),
  currency: 'PHP',
  period: 'MONTHLY',
  periodStart: new Date('2026-06-01T00:00:00.000Z'),
  periodEnd: new Date('2026-06-30T23:59:59.999Z'),
  isActive: true,
  category: { id: 'c1', name: 'Groceries', icon: 'cart', color: '#1A7A4A' },
  ...extra,
});

describe('BudgetsService.computePeriodBounds', () => {
  const service = new BudgetsService(buildPrisma() as unknown as PrismaService);

  it('computes monthly bounds (first to last ms of month)', () => {
    const { periodStart, periodEnd } = service.computePeriodBounds(
      'MONTHLY',
      new Date('2026-06-15T12:00:00.000Z'),
    );
    expect(periodStart.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(periodEnd.toISOString()).toBe('2026-06-30T23:59:59.999Z');
  });

  it('computes weekly bounds (7 days)', () => {
    const { periodStart, periodEnd } = service.computePeriodBounds(
      'WEEKLY',
      new Date('2026-06-01T00:00:00.000Z'),
    );
    expect(periodStart.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(periodEnd.toISOString()).toBe('2026-06-07T23:59:59.999Z');
  });
});

describe('BudgetsService.createOrUpdate', () => {
  it('upserts on (workspace, category, periodStart) with base currency and computed bounds', async () => {
    const prisma = buildPrisma();
    prisma.budget.upsert.mockResolvedValue(budgetRow());
    const service = new BudgetsService(prisma as unknown as PrismaService);

    const view = await service.createOrUpdate('w1', 'PHP', {
      categoryId: 'c1',
      amountLimit: '15000',
      period: 'MONTHLY',
      periodStart: '2026-06-10',
    });

    const arg = prisma.budget.upsert.mock.calls[0]?.[0] as {
      where: { workspaceId_categoryId_periodStart: { periodStart: Date } };
      create: { currency: string; periodEnd: Date };
    };
    expect(arg.where.workspaceId_categoryId_periodStart.periodStart.toISOString()).toBe(
      '2026-06-01T00:00:00.000Z',
    );
    expect(arg.create.currency).toBe('PHP');
    expect(view.utilizationPercent).toBeCloseTo(65.33, 1);
    expect(view.category).toEqual({
      id: 'c1',
      name: 'Groceries',
      icon: 'cart',
      color: '#1A7A4A',
    });
  });

  it('does not touch the transaction path when no replaceCategoryId is given', async () => {
    const prisma = buildPrisma();
    prisma.budget.upsert.mockResolvedValue(budgetRow());
    const service = new BudgetsService(prisma as unknown as PrismaService);

    await service.createOrUpdate('w1', 'PHP', {
      categoryId: 'c1',
      amountLimit: '15000',
      period: 'MONTHLY',
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.budget.delete).not.toHaveBeenCalled();
  });

  it('re-categorizes: deletes the placeholder budget and carries its spend over', async () => {
    const prisma = buildPrisma();
    const stale = budgetRow({
      id: 'b-other',
      amountSpent: new Prisma.Decimal('500'),
      category: { id: 'c-other', name: 'Other', icon: 'ellipsis', color: '#6B7280' },
    });
    prisma.budget.findUnique.mockResolvedValue(stale);
    prisma.budget.upsert.mockResolvedValue(budgetRow({ id: 'b-groceries' }));
    prisma.budget.update.mockResolvedValue(budgetRow({ id: 'b-groceries' }));
    const service = new BudgetsService(prisma as unknown as PrismaService);

    await service.createOrUpdate(
      'w1',
      'PHP',
      { categoryId: 'c1', amountLimit: '7000', period: 'MONTHLY' },
      { replaceCategoryId: 'c-other' },
    );

    expect(prisma.budget.delete).toHaveBeenCalledWith({ where: { id: 'b-other' } });
    expect(prisma.budget.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.budget.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'b-groceries' },
        data: { amountSpent: { increment: stale.amountSpent } },
      }),
    );
  });

  it('skips the replace path when replaceCategoryId equals the target category', async () => {
    const prisma = buildPrisma();
    prisma.budget.upsert.mockResolvedValue(budgetRow());
    const service = new BudgetsService(prisma as unknown as PrismaService);

    await service.createOrUpdate(
      'w1',
      'PHP',
      { categoryId: 'c1', amountLimit: '7000', period: 'MONTHLY' },
      { replaceCategoryId: 'c1' },
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.budget.delete).not.toHaveBeenCalled();
  });
});

describe('BudgetsService.applyTransactionSpend', () => {
  function txc(findFirst: jest.Mock, update: jest.Mock) {
    return { budget: { findFirst, update } } as unknown as Parameters<
      BudgetsService['applyTransactionSpend']
    >[0];
  }

  it('increments amountSpent of the covering budget and reports the crossing', async () => {
    const prisma = buildPrisma();
    const service = new BudgetsService(prisma as unknown as PrismaService);
    const findFirst = jest.fn().mockResolvedValue(budgetRow({ amountSpent: new Prisma.Decimal('9800') }));
    const update = jest.fn().mockResolvedValue({});

    const change = await service.applyTransactionSpend(txc(findFirst, update), {
      workspaceId: 'w1',
      categoryId: 'c1',
      transactionDate: new Date('2026-06-15T00:00:00.000Z'),
      amountBase: '1000',
      sign: 1,
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'b1' }, data: { amountSpent: { increment: '1000' } } }),
    );
    expect(change?.previousSpent).toBe('9800');
    expect(change?.newSpent).toBe('10800');
    expect(change?.newPercent).toBeCloseTo(72, 0);
  });

  it('returns null when no budget covers the transaction', async () => {
    const prisma = buildPrisma();
    const service = new BudgetsService(prisma as unknown as PrismaService);
    const findFirst = jest.fn().mockResolvedValue(null);
    const update = jest.fn();
    const change = await service.applyTransactionSpend(txc(findFirst, update), {
      workspaceId: 'w1',
      categoryId: 'c1',
      transactionDate: new Date('2026-06-15T00:00:00.000Z'),
      amountBase: '1000',
      sign: 1,
    });
    expect(change).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it('decrements on reversal (sign -1)', async () => {
    const prisma = buildPrisma();
    const service = new BudgetsService(prisma as unknown as PrismaService);
    const findFirst = jest.fn().mockResolvedValue(budgetRow({ amountSpent: new Prisma.Decimal('9800') }));
    const update = jest.fn().mockResolvedValue({});
    await service.applyTransactionSpend(txc(findFirst, update), {
      workspaceId: 'w1',
      categoryId: 'c1',
      transactionDate: new Date('2026-06-15T00:00:00.000Z'),
      amountBase: '800',
      sign: -1,
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { amountSpent: { decrement: '800' } } }),
    );
  });
});
