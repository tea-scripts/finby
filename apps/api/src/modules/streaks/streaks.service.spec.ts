import type { PrismaService } from '../../prisma/prisma.service';
import { StreaksService } from './streaks.service';
import * as time from '../reminders/reminders.time';

// localDayInfo is mocked so each test controls "today"; previousLocalDate stays
// real (pure calendar math) so the consecutive/gap logic is exercised honestly.
jest.mock('../reminders/reminders.time', () => {
  const actual = jest.requireActual('../reminders/reminders.time');
  return { ...actual, localDayInfo: jest.fn() };
});

const localDayInfo = time.localDayInfo as jest.MockedFunction<typeof time.localDayInfo>;

interface StreakUser {
  timezone: string;
  currentStreak: number;
  longestStreak: number;
  lastStreakDate: string | null;
  lastStreakRepairDate: string | null;
}

function setup(user: StreakUser | null) {
  const update = jest.fn().mockResolvedValue({});
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const findUnique = jest.fn().mockResolvedValue(user);
  const prisma = { user: { findUnique, update, updateMany } } as unknown as PrismaService;
  const service = new StreaksService(prisma);
  return { service, update, updateMany, findUnique };
}

function today(date: string) {
  localDayInfo.mockReturnValue({ hour: 12, date, startOfDayMs: 0 });
}

beforeEach(() => {
  localDayInfo.mockReset();
});

describe('StreaksService.onTransactionLogged', () => {
  it('starts a streak at 1 on the first transaction ever', async () => {
    today('2026-06-10');
    const { service, update } = setup({
      timezone: 'UTC',
      currentStreak: 0,
      longestStreak: 0,
      lastStreakDate: null,
      lastStreakRepairDate: null,
    });

    const streak = await service.onTransactionLogged('u1');

    expect(streak).toBe(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { currentStreak: 1, longestStreak: 1, lastStreakDate: '2026-06-10' },
    });
  });

  it('is idempotent for a second transaction the same day, returning the unchanged streak', async () => {
    today('2026-06-10');
    const { service, update } = setup({
      timezone: 'UTC',
      currentStreak: 3,
      longestStreak: 3,
      lastStreakDate: '2026-06-10',
      lastStreakRepairDate: null,
    });

    const streak = await service.onTransactionLogged('u1');

    expect(streak).toBe(3);
    expect(update).not.toHaveBeenCalled();
  });

  it('increments the streak on a consecutive day', async () => {
    today('2026-06-11');
    const { service, update } = setup({
      timezone: 'UTC',
      currentStreak: 1,
      longestStreak: 1,
      lastStreakDate: '2026-06-10',
      lastStreakRepairDate: null,
    });

    const streak = await service.onTransactionLogged('u1');

    expect(streak).toBe(2);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { currentStreak: 2, longestStreak: 2, lastStreakDate: '2026-06-11' },
    });
  });

  it('resets the streak to 1 after a gap, preserving the longest', async () => {
    today('2026-06-20');
    const { service, update } = setup({
      timezone: 'UTC',
      currentStreak: 5,
      longestStreak: 5,
      lastStreakDate: '2026-06-10', // 10-day gap
      lastStreakRepairDate: null,
    });

    const streak = await service.onTransactionLogged('u1');

    expect(streak).toBe(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { currentStreak: 1, longestStreak: 5, lastStreakDate: '2026-06-20' },
    });
  });

  it('never lowers longestStreak when the current streak grows below it', async () => {
    today('2026-06-11');
    const { service, update } = setup({
      timezone: 'UTC',
      currentStreak: 1,
      longestStreak: 9,
      lastStreakDate: '2026-06-10',
      lastStreakRepairDate: null,
    });

    const streak = await service.onTransactionLogged('u1');

    expect(streak).toBe(2);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { currentStreak: 2, longestStreak: 9, lastStreakDate: '2026-06-11' },
    });
  });

  it('resolves the day boundary in the user’s timezone', async () => {
    today('2026-06-10');
    const { service } = setup({
      timezone: 'Asia/Manila',
      currentStreak: 0,
      longestStreak: 0,
      lastStreakDate: null,
      lastStreakRepairDate: null,
    });

    await service.onTransactionLogged('u1');

    expect(localDayInfo).toHaveBeenCalledWith(expect.any(Date), 'Asia/Manila');
  });

  it('returns 0 and no-ops when the user no longer exists', async () => {
    today('2026-06-10');
    const { service, update } = setup(null);

    await expect(service.onTransactionLogged('ghost')).resolves.toBe(0);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('StreaksService.getStatus', () => {
  it('flags atRisk when exactly yesterday was missed (today not yet logged)', async () => {
    today('2026-06-12');
    const { service } = setup({
      timezone: 'UTC',
      currentStreak: 12,
      longestStreak: 12,
      lastStreakDate: '2026-06-10', // day before yesterday
      lastStreakRepairDate: null,
    });

    const status = await service.getStatus('u1', 'PRO');

    expect(status).toEqual({
      currentStreak: 12,
      longestStreak: 12,
      atRisk: true,
      repairEligible: true,
      repairUsedThisMonth: false,
    });
  });

  it('is not atRisk on a consecutive day (yesterday logged)', async () => {
    today('2026-06-12');
    const { service } = setup({
      timezone: 'UTC',
      currentStreak: 12,
      longestStreak: 12,
      lastStreakDate: '2026-06-11', // yesterday
      lastStreakRepairDate: null,
    });

    const status = await service.getStatus('u1', 'PRO');

    expect(status.atRisk).toBe(false);
    expect(status.repairEligible).toBe(false);
  });

  it('is not atRisk when today is already logged', async () => {
    today('2026-06-12');
    const { service } = setup({
      timezone: 'UTC',
      currentStreak: 12,
      longestStreak: 12,
      lastStreakDate: '2026-06-12', // logged today already
      lastStreakRepairDate: null,
    });

    const status = await service.getStatus('u1', 'PRO');

    expect(status.atRisk).toBe(false);
  });

  it('is not atRisk when two or more days were missed', async () => {
    today('2026-06-12');
    const { service } = setup({
      timezone: 'UTC',
      currentStreak: 12,
      longestStreak: 12,
      lastStreakDate: '2026-06-09', // 2-day gap
      lastStreakRepairDate: null,
    });

    const status = await service.getStatus('u1', 'PRO');

    expect(status.atRisk).toBe(false);
  });

  it('atRisk but not eligible for a FREE user', async () => {
    today('2026-06-12');
    const { service } = setup({
      timezone: 'UTC',
      currentStreak: 12,
      longestStreak: 12,
      lastStreakDate: '2026-06-10',
      lastStreakRepairDate: null,
    });

    const status = await service.getStatus('u1', 'FREE');

    expect(status.atRisk).toBe(true);
    expect(status.repairEligible).toBe(false);
  });

  it('atRisk but not eligible when already repaired this month', async () => {
    today('2026-06-12');
    const { service } = setup({
      timezone: 'UTC',
      currentStreak: 12,
      longestStreak: 12,
      lastStreakDate: '2026-06-10',
      lastStreakRepairDate: '2026-06-03', // same month
    });

    const status = await service.getStatus('u1', 'PRO');

    expect(status.atRisk).toBe(true);
    expect(status.repairUsedThisMonth).toBe(true);
    expect(status.repairEligible).toBe(false);
  });

  it('eligible again when the last repair was a previous month', async () => {
    today('2026-06-12');
    const { service } = setup({
      timezone: 'UTC',
      currentStreak: 12,
      longestStreak: 12,
      lastStreakDate: '2026-06-10',
      lastStreakRepairDate: '2026-05-30', // previous month
    });

    const status = await service.getStatus('u1', 'PRO');

    expect(status.repairUsedThisMonth).toBe(false);
    expect(status.repairEligible).toBe(true);
  });

  it('returns a zeroed status for a missing user', async () => {
    today('2026-06-12');
    const { service } = setup(null);

    const status = await service.getStatus('ghost', 'PRO');

    expect(status).toEqual({
      currentStreak: 0,
      longestStreak: 0,
      atRisk: false,
      repairEligible: false,
      repairUsedThisMonth: false,
    });
  });
});

describe('StreaksService.repair', () => {
  it('covers yesterday, stamps the repair date, and leaves the count untouched', async () => {
    today('2026-06-12');
    const { service, updateMany } = setup({
      timezone: 'UTC',
      currentStreak: 12,
      longestStreak: 15,
      lastStreakDate: '2026-06-10',
      lastStreakRepairDate: null,
    });

    const status = await service.repair('u1');

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', lastStreakDate: '2026-06-10' },
      data: { lastStreakDate: '2026-06-11', lastStreakRepairDate: '2026-06-12' },
    });
    expect(status).toEqual({
      currentStreak: 12,
      longestStreak: 15,
      atRisk: false,
      repairEligible: false,
      repairUsedThisMonth: true,
    });
  });

  it('throws NOT_AT_RISK when there is nothing to repair', async () => {
    today('2026-06-12');
    const { service, updateMany } = setup({
      timezone: 'UTC',
      currentStreak: 12,
      longestStreak: 12,
      lastStreakDate: '2026-06-11', // consecutive, not at risk
      lastStreakRepairDate: null,
    });

    await expect(service.repair('u1')).rejects.toMatchObject({
      response: { error: 'STREAK_NOT_AT_RISK' },
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('throws ALREADY_USED when a repair was already used this month', async () => {
    today('2026-06-12');
    const { service, updateMany } = setup({
      timezone: 'UTC',
      currentStreak: 12,
      longestStreak: 12,
      lastStreakDate: '2026-06-10',
      lastStreakRepairDate: '2026-06-02',
    });

    await expect(service.repair('u1')).rejects.toMatchObject({
      response: { error: 'STREAK_REPAIR_ALREADY_USED' },
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('throws NOT_AT_RISK when the guarded update loses a race (count 0)', async () => {
    today('2026-06-12');
    const { service, updateMany } = setup({
      timezone: 'UTC',
      currentStreak: 12,
      longestStreak: 12,
      lastStreakDate: '2026-06-10',
      lastStreakRepairDate: null,
    });
    updateMany.mockResolvedValue({ count: 0 });

    await expect(service.repair('u1')).rejects.toMatchObject({
      response: { error: 'STREAK_NOT_AT_RISK' },
    });
  });

  it('throws ALREADY_USED when the race is lost to a concurrent repair', async () => {
    today('2026-06-12');
    const { service, findUnique, updateMany } = setup({
      timezone: 'UTC',
      currentStreak: 12,
      longestStreak: 12,
      lastStreakDate: '2026-06-10',
      lastStreakRepairDate: null,
    });
    updateMany.mockResolvedValue({ count: 0 });
    // 1st read: the at-risk user (still eligible). 2nd read (post lost-race):
    // the allowance was stamped this month by the concurrent winner.
    findUnique
      .mockResolvedValueOnce({
        timezone: 'UTC',
        currentStreak: 12,
        longestStreak: 12,
        lastStreakDate: '2026-06-10',
        lastStreakRepairDate: null,
      })
      .mockResolvedValueOnce({ lastStreakRepairDate: '2026-06-12' });

    await expect(service.repair('u1')).rejects.toMatchObject({
      response: { error: 'STREAK_REPAIR_ALREADY_USED' },
    });
  });

  it('throws NOT_AT_RISK for a missing user', async () => {
    today('2026-06-12');
    const { service, updateMany } = setup(null);

    await expect(service.repair('ghost')).rejects.toMatchObject({
      response: { error: 'STREAK_NOT_AT_RISK' },
    });
    expect(updateMany).not.toHaveBeenCalled();
  });
});
