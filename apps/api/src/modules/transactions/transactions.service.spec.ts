import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FxService } from '../fx/fx.service';
import { BudgetsService } from '../budgets/budgets.service';
import { AlertsService } from '../alerts/alerts.service';
import { TransactionsService } from './transactions.service';

function buildBudgets() {
  return { applyTransactionSpend: jest.fn().mockResolvedValue(null) };
}

function buildAlerts() {
  return { generateBudgetAlert: jest.fn().mockResolvedValue(null) };
}

function buildPrisma() {
  const account = { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() };
  const transaction = {
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  };
  const client = { account, transaction, $transaction: jest.fn() };
  client.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function' ? (arg as (c: typeof client) => unknown)(client) : Promise.all(arg as unknown[]),
  );
  return client;
}

function buildFx(overrides?: { amountBase?: string; convertAmount?: string }) {
  return {
    convertToBase: jest.fn().mockResolvedValue({
      amountBase: overrides?.amountBase ?? '50',
      fxRateUsed: '1',
      fxRateTimestamp: new Date('2026-06-02T00:00:00.000Z'),
      rate: '1',
      date: '2026-06-02',
    }),
    convertAmount: jest.fn().mockResolvedValue(overrides?.convertAmount ?? '0'),
  };
}

function txRow(extra: Record<string, unknown> = {}) {
  return {
    id: 't1',
    type: 'EXPENSE',
    status: 'CONFIRMED',
    amountOriginal: new Prisma.Decimal('50'),
    currencyOriginal: 'USD',
    amountBase: new Prisma.Decimal('50'),
    currencyBase: 'USD',
    fxRateUsed: new Prisma.Decimal('1'),
    merchant: 'SM',
    description: null,
    category: null,
    fromAccount: { id: 'a1', name: 'Wise USD' },
    transactionDate: new Date('2026-06-02T00:00:00.000Z'),
    tags: [],
    aiConfidence: null,
    loggedByUserId: 'u1',
    createdAt: new Date('2026-06-02T10:00:00.000Z'),
    fromAccountId: 'a1',
    toAccountId: null,
    ...extra,
  };
}

const baseParams = {
  workspaceId: 'w1',
  loggedByUserId: 'u1',
  baseCurrency: 'USD',
  amountOriginal: '50',
  currencyOriginal: 'USD',
  transactionDate: '2026-06-02',
};

describe('TransactionsService.create', () => {
  it('EXPENSE from a matching-currency account decrements the balance and freezes amountBase', async () => {
    const prisma = buildPrisma();
    prisma.account.findFirst.mockResolvedValue({ id: 'a1', workspaceId: 'w1', currency: 'USD', name: 'Wise USD' });
    prisma.transaction.create.mockResolvedValue(txRow());
    const fx = buildFx({ amountBase: '50' });
    const service = new TransactionsService(prisma as unknown as PrismaService, fx as unknown as FxService, buildBudgets() as unknown as BudgetsService, buildAlerts() as unknown as AlertsService);

    const { transaction: view } = await service.create({
      ...baseParams,
      type: 'EXPENSE',
      accountId: 'a1',
      merchant: 'SM',
    });

    expect(prisma.account.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a1' }, data: { balance: { decrement: '50' } } }),
    );
    expect(view.amountBase).toBe('50');
    expect(view.status).toBe('CONFIRMED');
  });

  it('INCOME increments the account balance', async () => {
    const prisma = buildPrisma();
    prisma.account.findFirst.mockResolvedValue({ id: 'a1', workspaceId: 'w1', currency: 'USD', name: 'Wise' });
    prisma.transaction.create.mockResolvedValue(txRow({ type: 'INCOME' }));
    const fx = buildFx();
    const service = new TransactionsService(prisma as unknown as PrismaService, fx as unknown as FxService, buildBudgets() as unknown as BudgetsService, buildAlerts() as unknown as AlertsService);

    await service.create({ ...baseParams, type: 'INCOME', accountId: 'a1' });

    expect(prisma.account.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a1' }, data: { balance: { increment: '50' } } }),
    );
  });

  it('TRANSFER decrements source and increments destination (cross-currency)', async () => {
    const prisma = buildPrisma();
    prisma.account.findFirst
      .mockResolvedValueOnce({ id: 'a1', workspaceId: 'w1', currency: 'USD', name: 'Wise USD' })
      .mockResolvedValueOnce({ id: 'a2', workspaceId: 'w1', currency: 'PHP', name: 'BDO Peso' });
    prisma.transaction.create.mockResolvedValue(txRow({ type: 'TRANSFER', toAccountId: 'a2' }));
    const fx = buildFx({ convertAmount: '2860' });
    const service = new TransactionsService(prisma as unknown as PrismaService, fx as unknown as FxService, buildBudgets() as unknown as BudgetsService, buildAlerts() as unknown as AlertsService);

    await service.create({ ...baseParams, type: 'TRANSFER', accountId: 'a1', toAccountId: 'a2' });

    expect(prisma.account.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a1' }, data: { balance: { decrement: '50' } } }),
    );
    expect(prisma.account.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a2' }, data: { balance: { increment: '2860' } } }),
    );
  });

  it('creates without an account and does not touch any balance', async () => {
    const prisma = buildPrisma();
    prisma.transaction.create.mockResolvedValue(txRow({ fromAccount: null, fromAccountId: null }));
    const fx = buildFx();
    const service = new TransactionsService(prisma as unknown as PrismaService, fx as unknown as FxService, buildBudgets() as unknown as BudgetsService, buildAlerts() as unknown as AlertsService);

    const { transaction: view } = await service.create({ ...baseParams, type: 'EXPENSE' });

    expect(prisma.account.update).not.toHaveBeenCalled();
    expect(view.account).toBeNull();
  });

  it('rejects an expense whose account currency does not match (422)', async () => {
    const prisma = buildPrisma();
    prisma.account.findFirst.mockResolvedValue({ id: 'a1', workspaceId: 'w1', currency: 'PHP', name: 'BDO' });
    const fx = buildFx();
    const service = new TransactionsService(prisma as unknown as PrismaService, fx as unknown as FxService, buildBudgets() as unknown as BudgetsService, buildAlerts() as unknown as AlertsService);

    await expect(
      service.create({ ...baseParams, type: 'EXPENSE', currencyOriginal: 'USD', accountId: 'a1' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('throws NotFound when the account is not in the workspace', async () => {
    const prisma = buildPrisma();
    prisma.account.findFirst.mockResolvedValue(null);
    const fx = buildFx();
    const service = new TransactionsService(prisma as unknown as PrismaService, fx as unknown as FxService, buildBudgets() as unknown as BudgetsService, buildAlerts() as unknown as AlertsService);

    await expect(
      service.create({ ...baseParams, type: 'EXPENSE', accountId: 'missing' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('TransactionsService.void', () => {
  it('reverses an EXPENSE balance and sets status VOID', async () => {
    const prisma = buildPrisma();
    prisma.transaction.findFirst.mockResolvedValue(txRow());
    const fx = buildFx();
    const service = new TransactionsService(prisma as unknown as PrismaService, fx as unknown as FxService, buildBudgets() as unknown as BudgetsService, buildAlerts() as unknown as AlertsService);

    const result = await service.void('w1', 't1');

    expect(prisma.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 't1' }, data: { status: 'VOID' } }),
    );
    expect(prisma.account.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a1' }, data: { balance: { increment: '50' } } }),
    );
    expect(result.message).toMatch(/voided/i);
  });

  it('is idempotent for an already-voided transaction', async () => {
    const prisma = buildPrisma();
    prisma.transaction.findFirst.mockResolvedValue(txRow({ status: 'VOID' }));
    const fx = buildFx();
    const service = new TransactionsService(prisma as unknown as PrismaService, fx as unknown as FxService, buildBudgets() as unknown as BudgetsService, buildAlerts() as unknown as AlertsService);

    await service.void('w1', 't1');
    expect(prisma.account.update).not.toHaveBeenCalled();
  });
});

describe('TransactionsService.update', () => {
  it('moves budget spend off the old category and onto the new one when re-categorized', async () => {
    const prisma = buildPrisma();
    prisma.transaction.findFirst.mockResolvedValue(txRow({ categoryId: 'c-old' }));
    prisma.transaction.update.mockResolvedValue(txRow({ categoryId: 'c-new', category: { id: 'c-new', name: 'Dining' } }));
    const fx = buildFx();
    const budgets = buildBudgets();
    const service = new TransactionsService(prisma as unknown as PrismaService, fx as unknown as FxService, budgets as unknown as BudgetsService, buildAlerts() as unknown as AlertsService);

    await service.update('w1', 't1', { categoryId: 'c-new' } as never);

    // reverse old category (sign -1) then apply new category (sign +1)
    expect(budgets.applyTransactionSpend).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({ categoryId: 'c-old', amountBase: '50', sign: -1 }),
    );
    expect(budgets.applyTransactionSpend).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ categoryId: 'c-new', amountBase: '50', sign: 1 }),
    );
  });

  it('does not touch budgets when only the merchant changes', async () => {
    const prisma = buildPrisma();
    prisma.transaction.findFirst.mockResolvedValue(txRow({ categoryId: 'c-old' }));
    prisma.transaction.update.mockResolvedValue(txRow({ categoryId: 'c-old', merchant: 'Starbucks' }));
    const fx = buildFx();
    const budgets = buildBudgets();
    const service = new TransactionsService(prisma as unknown as PrismaService, fx as unknown as FxService, budgets as unknown as BudgetsService, buildAlerts() as unknown as AlertsService);

    await service.update('w1', 't1', { merchant: 'Starbucks' } as never);

    expect(budgets.applyTransactionSpend).not.toHaveBeenCalled();
  });

  it('does not re-apply budgets for a non-expense', async () => {
    const prisma = buildPrisma();
    prisma.transaction.findFirst.mockResolvedValue(txRow({ type: 'INCOME', categoryId: 'c-old' }));
    prisma.transaction.update.mockResolvedValue(txRow({ type: 'INCOME', categoryId: 'c-new' }));
    const fx = buildFx();
    const budgets = buildBudgets();
    const service = new TransactionsService(prisma as unknown as PrismaService, fx as unknown as FxService, budgets as unknown as BudgetsService, buildAlerts() as unknown as AlertsService);

    await service.update('w1', 't1', { categoryId: 'c-new' } as never);

    expect(budgets.applyTransactionSpend).not.toHaveBeenCalled();
  });

  it('throws NotFound for a missing transaction', async () => {
    const prisma = buildPrisma();
    prisma.transaction.findFirst.mockResolvedValue(null);
    const fx = buildFx();
    const service = new TransactionsService(prisma as unknown as PrismaService, fx as unknown as FxService, buildBudgets() as unknown as BudgetsService, buildAlerts() as unknown as AlertsService);

    await expect(service.update('w1', 'missing', { categoryId: 'c-new' } as never)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('TransactionsService.findLatestForCorrection', () => {
  it('returns the most recent non-void match with the given filters', async () => {
    const prisma = buildPrisma();
    prisma.transaction.findFirst.mockResolvedValue(txRow());
    const fx = buildFx();
    const service = new TransactionsService(prisma as unknown as PrismaService, fx as unknown as FxService, buildBudgets() as unknown as BudgetsService, buildAlerts() as unknown as AlertsService);

    const view = await service.findLatestForCorrection('w1', { type: 'EXPENSE', merchant: 'SM' });

    const arg = prisma.transaction.findFirst.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      orderBy: unknown;
    };
    expect(arg.where.status).toEqual({ not: 'VOID' });
    expect(arg.where.type).toBe('EXPENSE');
    expect(arg.where.merchant).toEqual({ contains: 'SM', mode: 'insensitive' });
    expect(view?.id).toBe('t1');
  });

  it('returns null when nothing matches', async () => {
    const prisma = buildPrisma();
    prisma.transaction.findFirst.mockResolvedValue(null);
    const fx = buildFx();
    const service = new TransactionsService(prisma as unknown as PrismaService, fx as unknown as FxService, buildBudgets() as unknown as BudgetsService, buildAlerts() as unknown as AlertsService);

    expect(await service.findLatestForCorrection('w1', {})).toBeNull();
  });
});

describe('TransactionsService.list', () => {
  it('caps fromDate to the last 90 days on FREE tier', async () => {
    const prisma = buildPrisma();
    prisma.transaction.findMany.mockResolvedValue([]);
    const fx = buildFx();
    const service = new TransactionsService(prisma as unknown as PrismaService, fx as unknown as FxService, buildBudgets() as unknown as BudgetsService, buildAlerts() as unknown as AlertsService);

    await service.list('w1', 'FREE', { limit: 20, fromDate: '2000-01-01', tags: [] } as never);

    const arg = prisma.transaction.findMany.mock.calls[0]?.[0] as {
      where: { transactionDate?: { gte?: Date } };
    };
    const gte = arg.where.transactionDate?.gte;
    expect(gte).toBeInstanceOf(Date);
    const ninetyDaysAgo = Date.now() - 90 * 86400000;
    // floored to ~90d ago, not the requested year 2000
    expect((gte as Date).getTime()).toBeGreaterThan(ninetyDaysAgo - 86400000);
  });

  it('excludes voided transactions from the list', async () => {
    const prisma = buildPrisma();
    prisma.transaction.findMany.mockResolvedValue([]);
    const fx = buildFx();
    const service = new TransactionsService(prisma as unknown as PrismaService, fx as unknown as FxService, buildBudgets() as unknown as BudgetsService, buildAlerts() as unknown as AlertsService);

    await service.list('w1', 'PRO', { limit: 20, tags: [] } as never);

    const arg = prisma.transaction.findMany.mock.calls[0]?.[0] as {
      where: { status?: unknown };
    };
    expect(arg.where.status).toEqual({ not: 'VOID' });
  });
});
