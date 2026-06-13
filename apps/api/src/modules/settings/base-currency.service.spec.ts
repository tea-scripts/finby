import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BaseCurrencyService } from './base-currency.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FxService } from '../fx/fx.service';

function buildFx(rates: Record<string, string>) {
  return {
    getRate: jest.fn(async (from: string, to: string) => {
      const key = `${from.toUpperCase()}->${to.toUpperCase()}`;
      if (from.toUpperCase() === to.toUpperCase()) return { rate: '1' };
      const rate = rates[key];
      if (!rate) throw new Error(`no rate ${key}`);
      return { rate };
    }),
  } as unknown as FxService;
}

function buildPrisma(overrides: {
  workspace?: { baseCurrency: string; preferredCurrencies: string[] } | null;
  transactions?: Array<Record<string, unknown>>;
  budgets?: Array<Record<string, unknown>>;
  events?: Array<Record<string, unknown>>;
}) {
  const txUpdate = jest.fn().mockResolvedValue({});
  const budgetUpdate = jest.fn().mockResolvedValue({});
  const eventUpdate = jest.fn().mockResolvedValue({});
  const workspaceUpdate = jest
    .fn()
    .mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({
        baseCurrency: args.data.baseCurrency,
        preferredCurrencies: args.data.preferredCurrencies,
      }),
    );

  const client = {
    workspace: {
      findUnique: jest.fn().mockResolvedValue(overrides.workspace ?? null),
      update: workspaceUpdate,
    },
    transaction: {
      findMany: jest.fn().mockResolvedValue(overrides.transactions ?? []),
      update: txUpdate,
    },
    budget: {
      findMany: jest.fn().mockResolvedValue(overrides.budgets ?? []),
      update: budgetUpdate,
    },
    investmentEvent: {
      findMany: jest.fn().mockResolvedValue(overrides.events ?? []),
      update: eventUpdate,
    },
    conversation: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  (client as unknown as { $transaction: unknown }).$transaction = jest.fn(
    (fn: (c: typeof client) => unknown) => fn(client),
  );
  return {
    client,
    txUpdate,
    budgetUpdate,
    eventUpdate,
    workspaceUpdate,
    conversationUpdateMany: client.conversation.updateMany,
  };
}

function build(prismaParts: ReturnType<typeof buildPrisma>, fx: FxService) {
  return new BaseCurrencyService(prismaParts.client as unknown as PrismaService, fx);
}

describe('BaseCurrencyService.updateBaseCurrency', () => {
  it('rejects an unknown currency code', async () => {
    const parts = buildPrisma({ workspace: { baseCurrency: 'USD', preferredCurrencies: ['USD'] } });
    const service = build(parts, buildFx({}));
    await expect(service.updateBaseCurrency('ws1', 'ZZZ')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws NotFound for a missing workspace', async () => {
    const parts = buildPrisma({ workspace: null });
    const service = build(parts, buildFx({}));
    await expect(service.updateBaseCurrency('ws1', 'NGN')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is a no-op when the new base equals the current base', async () => {
    const parts = buildPrisma({ workspace: { baseCurrency: 'USD', preferredCurrencies: ['USD'] } });
    const service = build(parts, buildFx({}));
    const result = await service.updateBaseCurrency('ws1', 'USD');
    expect(result).toEqual({ baseCurrency: 'USD', preferredCurrencies: ['USD'], recomputed: 0 });
    expect(parts.txUpdate).not.toHaveBeenCalled();
    expect(parts.workspaceUpdate).not.toHaveBeenCalled();
  });

  it('recomputes transactions, budgets, events and the workspace (USD -> NGN)', async () => {
    const parts = buildPrisma({
      workspace: { baseCurrency: 'USD', preferredCurrencies: ['USD', 'EUR'] },
      transactions: [
        {
          id: 't1',
          amountOriginal: new Prisma.Decimal('100'),
          currencyOriginal: 'USD',
          transactionDate: new Date('2026-06-01T00:00:00.000Z'),
          type: 'EXPENSE',
          status: 'CONFIRMED',
          categoryId: 'c1',
        },
      ],
      budgets: [
        {
          id: 'b1',
          categoryId: 'c1',
          amountLimit: new Prisma.Decimal('500'),
          periodStart: new Date('2026-06-01T00:00:00.000Z'),
          periodEnd: new Date('2026-06-30T00:00:00.000Z'),
        },
      ],
      events: [
        {
          id: 'e1',
          pricePerUnit: new Prisma.Decimal('10'),
          currency: 'USD',
          eventDate: new Date('2026-05-01T00:00:00.000Z'),
        },
      ],
    });
    const fx = buildFx({ 'USD->NGN': '1500' });
    const service = build(parts, fx);

    const result = await service.updateBaseCurrency('ws1', 'NGN');

    expect(parts.txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 't1' },
        data: expect.objectContaining({ amountBase: '150000', currencyBase: 'NGN', fxRateUsed: '1500' }),
      }),
    );
    expect(parts.budgetUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'b1' },
        data: expect.objectContaining({ amountLimit: '750000', amountSpent: '150000', currency: 'NGN' }),
      }),
    );
    expect(parts.eventUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'e1' },
        data: expect.objectContaining({ priceBase: '15000', fxRateUsed: '1500' }),
      }),
    );
    expect(parts.workspaceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws1' },
        data: expect.objectContaining({ baseCurrency: 'NGN' }),
      }),
    );
    const pref = parts.workspaceUpdate.mock.calls[0][0].data.preferredCurrencies as string[];
    expect(pref).toEqual(expect.arrayContaining(['USD', 'EUR', 'NGN']));
    // stale-currency chat summaries are cleared for the workspace
    expect(parts.conversationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'ws1' },
        data: expect.objectContaining({ rollingContextSummary: null }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ baseCurrency: 'NGN', recomputed: 1 }));
  });

  it('falls back to the latest rate when a per-date historical rate is unavailable', async () => {
    const parts = buildPrisma({
      workspace: { baseCurrency: 'USD', preferredCurrencies: ['USD'] },
      transactions: [
        {
          id: 't1',
          amountOriginal: new Prisma.Decimal('50'),
          currencyOriginal: 'USD',
          transactionDate: new Date('2024-01-01T00:00:00.000Z'),
          type: 'INCOME',
          status: 'CONFIRMED',
          categoryId: null,
        },
      ],
    });
    const getRate = jest
      .fn()
      .mockImplementationOnce(async () => {
        throw new Error('no historical rate');
      })
      .mockImplementationOnce(async () => ({ rate: '1600' }));
    const fx = { getRate } as unknown as FxService;
    const service = build(parts, fx);

    await service.updateBaseCurrency('ws1', 'NGN');

    expect(getRate).toHaveBeenCalledTimes(2);
    expect(getRate.mock.calls[0]).toEqual(['USD', 'NGN', '2024-01-01']);
    expect(getRate.mock.calls[1]).toEqual(['USD', 'NGN']);
    expect(parts.txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amountBase: '80000' }) }),
    );
  });
});
