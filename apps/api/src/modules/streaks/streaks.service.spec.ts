import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AchievementService } from '../gamification/achievement.service';
import type { XpService } from '../gamification/xp.service';
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

function setup(user: StreakUser | null, opts?: { xpBalance?: number | null }) {
  const update = jest.fn().mockResolvedValue({});
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const findUnique = jest.fn().mockResolvedValue(user);
  const xpBalance = opts && 'xpBalance' in opts ? opts.xpBalance : 100;
  const xpFindUnique = jest
    .fn()
    .mockResolvedValue(xpBalance === null || xpBalance === undefined ? null : { balance: xpBalance });
  const prisma = {
    user: { findUnique, update, updateMany },
    userXp: { findUnique: xpFindUnique },
  } as unknown as PrismaService;

  const awardXp = jest.fn().mockResolvedValue({});
  const spendXp = jest.fn().mockResolvedValue({});
  const checkAndUnlock = jest.fn().mockResolvedValue([]);
  const xpService = { awardXp, spendXp } as unknown as XpService;
  const achievementService = { checkAndUnlock } as unknown as AchievementService;

  const service = new StreaksService(prisma, xpService, achievementService);
  return { service, update, updateMany, findUnique, xpFindUnique, awardXp, spendXp, checkAndUnlock };
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

    const result = await service.onTransactionLogged('u1', 'FREE');

    expect(result.currentStreak).toBe(1);
    expect(result.newAchievements).toEqual([]);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { currentStreak: 1, longestStreak: 1, lastStreakDate: '2026-06-10' },
    });
  });

  it('awards a STREAK_DAY XP grant scaled by tier on a new day', async () => {
    today('2026-06-11');
    const { service, awardXp } = setup({
      timezone: 'UTC',
      currentStreak: 1,
      longestStreak: 1,
      lastStreakDate: '2026-06-10',
      lastStreakRepairDate: null,
    });

    await service.onTransactionLogged('u1', 'PRO');

    expect(awardXp).toHaveBeenCalledWith('u1', 'PRO', 'STREAK_DAY', { streakDay: 2 });
  });

  it('awards a milestone bonus when the streak hits a milestone length', async () => {
    today('2026-06-17');
    const { service, awardXp } = setup({
      timezone: 'UTC',
      currentStreak: 6,
      longestStreak: 6,
      lastStreakDate: '2026-06-16',
      lastStreakRepairDate: null,
    });

    await service.onTransactionLogged('u1', 'FREE');

    expect(awardXp).toHaveBeenCalledWith('u1', 'FREE', 'STREAK_DAY', { streakDay: 7 });
    expect(awardXp).toHaveBeenCalledWith('u1', 'FREE', 'STREAK_MILESTONE', { streakDay: 7 });
  });

  it('does not award a milestone bonus for a non-milestone day', async () => {
    today('2026-06-12');
    const { service, awardXp } = setup({
      timezone: 'UTC',
      currentStreak: 2,
      longestStreak: 2,
      lastStreakDate: '2026-06-11',
      lastStreakRepairDate: null,
    });

    await service.onTransactionLogged('u1', 'FREE');

    expect(awardXp).toHaveBeenCalledTimes(1);
    expect(awardXp).toHaveBeenCalledWith('u1', 'FREE', 'STREAK_DAY', { streakDay: 3 });
  });

  it('surfaces achievements unlocked by the log', async () => {
    today('2026-06-17');
    const { service, checkAndUnlock } = setup({
      timezone: 'UTC',
      currentStreak: 6,
      longestStreak: 6,
      lastStreakDate: '2026-06-16',
      lastStreakRepairDate: null,
    });
    checkAndUnlock.mockResolvedValue([
      {
        unlockedAt: new Date('2026-06-17T00:00:00Z'),
        achievementDef: { slug: 'streak-bronze', tier: 'BRONZE', label: 'Week Warrior' },
      },
    ]);

    const result = await service.onTransactionLogged('u1', 'FREE');

    expect(checkAndUnlock).toHaveBeenCalledWith('u1', 'STREAK', 7);
    expect(result.newAchievements).toEqual([
      {
        slug: 'streak-bronze',
        tier: 'BRONZE',
        label: 'Week Warrior',
        unlockedAt: new Date('2026-06-17T00:00:00Z'),
      },
    ]);
  });

  it('is idempotent for a second transaction the same day, returning the unchanged streak and no XP', async () => {
    today('2026-06-10');
    const { service, update, awardXp } = setup({
      timezone: 'UTC',
      currentStreak: 3,
      longestStreak: 3,
      lastStreakDate: '2026-06-10',
      lastStreakRepairDate: null,
    });

    const result = await service.onTransactionLogged('u1', 'FREE');

    expect(result.currentStreak).toBe(3);
    expect(result.newAchievements).toEqual([]);
    expect(update).not.toHaveBeenCalled();
    expect(awardXp).not.toHaveBeenCalled();
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

    const result = await service.onTransactionLogged('u1', 'FREE');

    expect(result.currentStreak).toBe(2);
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

    const result = await service.onTransactionLogged('u1', 'FREE');

    expect(result.currentStreak).toBe(1);
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

    const result = await service.onTransactionLogged('u1', 'FREE');

    expect(result.currentStreak).toBe(2);
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

    await service.onTransactionLogged('u1', 'FREE');

    expect(localDayInfo).toHaveBeenCalledWith(expect.any(Date), 'Asia/Manila');
  });

  it('returns a zeroed result and no-ops when the user no longer exists', async () => {
    today('2026-06-10');
    const { service, update, awardXp } = setup(null);

    const result = await service.onTransactionLogged('ghost', 'FREE');

    expect(result).toEqual({ currentStreak: 0, newAchievements: [] });
    expect(update).not.toHaveBeenCalled();
    expect(awardXp).not.toHaveBeenCalled();
  });
});

describe('StreaksService.getStatus', () => {
  it('flags atRisk and repairEligible when missed yesterday with enough XP', async () => {
    today('2026-06-12');
    const { service } = setup(
      {
        timezone: 'UTC',
        currentStreak: 12,
        longestStreak: 12,
        lastStreakDate: '2026-06-10', // day before yesterday
        lastStreakRepairDate: null,
      },
      { xpBalance: 50 },
    );

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

  it('atRisk but not eligible when the XP balance is below the recovery cost', async () => {
    today('2026-06-12');
    const { service } = setup(
      {
        timezone: 'UTC',
        currentStreak: 12,
        longestStreak: 12,
        lastStreakDate: '2026-06-10',
        lastStreakRepairDate: null,
      },
      { xpBalance: 5 },
    );

    const status = await service.getStatus('u1', 'FREE');

    expect(status.atRisk).toBe(true);
    expect(status.repairEligible).toBe(false);
  });

  it('eligible on any tier (incl. FREE) once the XP balance covers the cost', async () => {
    today('2026-06-12');
    const { service } = setup(
      {
        timezone: 'UTC',
        currentStreak: 12,
        longestStreak: 12,
        lastStreakDate: '2026-06-10',
        lastStreakRepairDate: null,
      },
      { xpBalance: 10 },
    );

    const status = await service.getStatus('u1', 'FREE');

    expect(status.repairEligible).toBe(true);
  });

  it('not eligible when the user has no XP record yet', async () => {
    today('2026-06-12');
    const { service } = setup(
      {
        timezone: 'UTC',
        currentStreak: 12,
        longestStreak: 12,
        lastStreakDate: '2026-06-10',
        lastStreakRepairDate: null,
      },
      { xpBalance: null },
    );

    const status = await service.getStatus('u1', 'PRO');

    expect(status.atRisk).toBe(true);
    expect(status.repairEligible).toBe(false);
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

  it('resolves the day boundary in the user’s timezone', async () => {
    today('2026-06-12');
    const { service } = setup({
      timezone: 'Asia/Manila',
      currentStreak: 12,
      longestStreak: 12,
      lastStreakDate: '2026-06-10',
      lastStreakRepairDate: null,
    });

    await service.getStatus('u1', 'PRO');

    expect(localDayInfo).toHaveBeenCalledWith(expect.any(Date), 'Asia/Manila');
  });
});

describe('StreaksService.repair', () => {
  it('spends XP, covers yesterday, stamps the repair date, and leaves the count untouched', async () => {
    today('2026-06-12');
    const { service, updateMany, spendXp } = setup({
      timezone: 'UTC',
      currentStreak: 12,
      longestStreak: 15,
      lastStreakDate: '2026-06-10',
      lastStreakRepairDate: null,
    });

    const status = await service.repair('u1');

    expect(spendXp).toHaveBeenCalledWith('u1', 10, 'STREAK_RECOVERY', { recoveredDate: '2026-06-11' });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', lastStreakDate: '2026-06-10' },
      data: { lastStreakDate: '2026-06-11', lastStreakRepairDate: '2026-06-12' },
    });
    expect(status).toEqual({
      currentStreak: 12,
      longestStreak: 15,
      atRisk: false,
      repairEligible: false,
      repairUsedThisMonth: false,
    });
  });

  it('throws NOT_AT_RISK when there is nothing to repair (no XP spent)', async () => {
    today('2026-06-12');
    const { service, updateMany, spendXp } = setup({
      timezone: 'UTC',
      currentStreak: 12,
      longestStreak: 12,
      lastStreakDate: '2026-06-11', // consecutive, not at risk
      lastStreakRepairDate: null,
    });

    await expect(service.repair('u1')).rejects.toMatchObject({
      response: { error: 'STREAK_NOT_AT_RISK' },
    });
    expect(spendXp).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('propagates the BadRequest from spendXp when the balance is insufficient', async () => {
    today('2026-06-12');
    const { service, updateMany, spendXp } = setup({
      timezone: 'UTC',
      currentStreak: 12,
      longestStreak: 12,
      lastStreakDate: '2026-06-10',
      lastStreakRepairDate: null,
    });
    spendXp.mockRejectedValue(new BadRequestException('Insufficient XP'));

    await expect(service.repair('u1')).rejects.toBeInstanceOf(BadRequestException);
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

  it('throws NOT_AT_RISK for a missing user', async () => {
    today('2026-06-12');
    const { service, updateMany, spendXp } = setup(null);

    await expect(service.repair('ghost')).rejects.toMatchObject({
      response: { error: 'STREAK_NOT_AT_RISK' },
    });
    expect(spendXp).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });
});
