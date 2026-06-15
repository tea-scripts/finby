import { BadRequestException } from '@nestjs/common';
import { XpEvent } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { XpService } from './xp.service';
import * as time from '../reminders/reminders.time';

// Mock the timezone helper so getXpSummary's "local today" boundary is observable
// and deterministic without depending on the host clock/zone.
jest.mock('../reminders/reminders.time', () => {
  const actual = jest.requireActual('../reminders/reminders.time');
  return { ...actual, localDayInfo: jest.fn() };
});
const localDayInfo = time.localDayInfo as jest.MockedFunction<typeof time.localDayInfo>;

interface PrismaOverrides {
  xp?: { balance: number; totalEarned: number } | null;
  user?: { timezone: string } | null;
  updatedXp?: unknown;
  todaySum?: number | null;
  history?: unknown[];
}

function buildPrisma(overrides: PrismaOverrides = {}) {
  const xpCreate = jest.fn((args: unknown) => ({ __xpCreate: args }));
  const userXpUpsert = jest.fn((args: unknown) => ({ __upsert: args }));
  const userXpUpdate = jest.fn((_args: unknown) => overrides.updatedXp ?? { balance: 0, totalEarned: 0 });
  const userXpFindUnique = jest.fn().mockResolvedValue(overrides.xp ?? null);
  const userFindUnique = jest.fn().mockResolvedValue(overrides.user ?? { timezone: 'UTC' });
  const aggregate = jest.fn().mockResolvedValue({ _sum: { delta: overrides.todaySum ?? null } });
  const findMany = jest.fn().mockResolvedValue(overrides.history ?? []);
  const $transaction = jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops));

  const prisma = {
    xpTransaction: { create: xpCreate, aggregate, findMany },
    userXp: { upsert: userXpUpsert, update: userXpUpdate, findUnique: userXpFindUnique },
    user: { findUnique: userFindUnique },
    $transaction,
  } as unknown as PrismaService;

  return { prisma, xpCreate, userXpUpsert, userXpUpdate, userXpFindUnique, aggregate, findMany, $transaction };
}

beforeEach(() => {
  localDayInfo.mockReset();
  localDayInfo.mockReturnValue({ hour: 0, date: '2026-06-12', startOfDayMs: 1_000 });
});

describe('XpService.awardXp', () => {
  it('grants base XP on the FREE tier (x1)', async () => {
    const { prisma, xpCreate, userXpUpsert } = buildPrisma();
    const service = new XpService(prisma);

    await service.awardXp('u1', 'FREE', XpEvent.STREAK_DAY);

    expect(xpCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u1', event: 'STREAK_DAY', delta: 1 }),
    });
    expect(userXpUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        create: { userId: 'u1', balance: 1, totalEarned: 1 },
        update: { balance: { increment: 1 }, totalEarned: { increment: 1 } },
      }),
    );
  });

  it('scales by the PRO multiplier (x3)', async () => {
    const { prisma, xpCreate } = buildPrisma();
    const service = new XpService(prisma);

    await service.awardXp('u1', 'PRO', XpEvent.STREAK_DAY);

    expect(xpCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ delta: 3 }),
    });
  });

  it('scales by the PREMIUM multiplier (x5)', async () => {
    const { prisma, xpCreate } = buildPrisma();
    const service = new XpService(prisma);

    await service.awardXp('u1', 'PREMIUM', XpEvent.STREAK_DAY);

    expect(xpCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ delta: 5 }) });
  });

  it('scales by the FAMILY multiplier (x5)', async () => {
    const { prisma, xpCreate } = buildPrisma();
    const service = new XpService(prisma);

    await service.awardXp('u1', 'FAMILY', XpEvent.STREAK_DAY);

    expect(xpCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ delta: 5 }) });
  });

  it('persists the ledger row and balance in one prisma.$transaction', async () => {
    const { prisma, $transaction } = buildPrisma();
    const service = new XpService(prisma);

    await service.awardXp('u1', 'FREE', XpEvent.TRANSACTION_LOGGED);

    expect($transaction).toHaveBeenCalledTimes(1);
  });
});

describe('XpService.spendXp', () => {
  it('decrements the balance (only) and journals a negative entry when affordable', async () => {
    const { prisma, xpCreate, userXpUpdate } = buildPrisma({
      xp: { balance: 50, totalEarned: 100 },
      updatedXp: { id: 'x1', userId: 'u1', balance: 40, totalEarned: 100 },
    });
    const service = new XpService(prisma);

    const result = await service.spendXp('u1', 10, XpEvent.STREAK_RECOVERY);

    expect(xpCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ event: 'STREAK_RECOVERY', delta: -10 }),
    });
    expect(userXpUpdate).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { balance: { decrement: 10 } },
    });
    // totalEarned must not appear in the update payload.
    const updateArg = userXpUpdate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(updateArg.data).not.toHaveProperty('totalEarned');
    expect(result).toMatchObject({ balance: 40, totalEarned: 100 });
  });

  it('throws BadRequestException when the balance is below the cost', async () => {
    const { prisma, xpCreate, userXpUpdate } = buildPrisma({ xp: { balance: 5, totalEarned: 80 } });
    const service = new XpService(prisma);

    await expect(service.spendXp('u1', 10, XpEvent.STREAK_RECOVERY)).rejects.toThrow(
      new BadRequestException('Insufficient XP'),
    );
    expect(xpCreate).not.toHaveBeenCalled();
    expect(userXpUpdate).not.toHaveBeenCalled();
  });

  it('throws when the user has no XP record yet', async () => {
    const { prisma } = buildPrisma({ xp: null });
    const service = new XpService(prisma);

    await expect(service.spendXp('u1', 10, XpEvent.STREAK_RECOVERY)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('XpService.getXpSummary', () => {
  it('computes todayEarned against the user timezone, not UTC', async () => {
    const { prisma, aggregate } = buildPrisma({
      xp: { balance: 30, totalEarned: 120 },
      user: { timezone: 'Asia/Manila' },
      todaySum: 7,
    });
    const service = new XpService(prisma);

    const summary = await service.getXpSummary('u1');

    expect(localDayInfo).toHaveBeenCalledWith(expect.any(Date), 'Asia/Manila');
    expect(summary).toEqual({ balance: 30, totalEarned: 120, todayEarned: 7 });
    // The aggregate window starts at the mocked local-midnight instant.
    expect(aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'u1',
          delta: { gt: 0 },
          createdAt: { gte: new Date(1_000) },
        }),
      }),
    );
  });

  it('returns zeros when the user has no XP yet', async () => {
    const { prisma } = buildPrisma({ xp: null, todaySum: null });
    const service = new XpService(prisma);

    const summary = await service.getXpSummary('u1');

    expect(summary).toEqual({ balance: 0, totalEarned: 0, todayEarned: 0 });
  });
});

describe('XpService.getXpHistory', () => {
  it('returns up to 20 entries ordered newest first by default', async () => {
    const { prisma, findMany } = buildPrisma({ history: [{ id: 't1' }] });
    const service = new XpService(prisma);

    const history = await service.getXpHistory('u1');

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    expect(history).toEqual([{ id: 't1' }]);
  });

  it('honours an explicit limit', async () => {
    const { prisma, findMany } = buildPrisma();
    const service = new XpService(prisma);

    await service.getXpHistory('u1', 5);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
  });
});
