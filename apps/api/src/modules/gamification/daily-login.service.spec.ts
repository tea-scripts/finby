import { XpEvent } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { XpService } from './xp.service';
import { DailyLoginService } from './daily-login.service';
import * as time from '../reminders/reminders.time';

jest.mock('../reminders/reminders.time', () => {
  const actual = jest.requireActual('../reminders/reminders.time');
  return { ...actual, localDayInfo: jest.fn() };
});
const localDayInfo = time.localDayInfo as jest.MockedFunction<typeof time.localDayInfo>;

interface Overrides {
  user?: { timezone: string; workspaceMemberships: { workspace: { tier: string } }[] } | null;
  updateCount?: number;
}

function build(overrides: Overrides = {}) {
  const userFindUnique = jest.fn().mockResolvedValue(
    overrides.user === undefined
      ? { timezone: 'UTC', workspaceMemberships: [{ workspace: { tier: 'FREE' } }] }
      : overrides.user,
  );
  const userUpdateMany = jest.fn().mockResolvedValue({ count: overrides.updateCount ?? 1 });
  const prisma = {
    user: { findUnique: userFindUnique, updateMany: userUpdateMany },
  } as unknown as PrismaService;
  const awardXp = jest.fn().mockResolvedValue(undefined);
  const xpService = { awardXp } as unknown as XpService;
  return { prisma, xpService, userFindUnique, userUpdateMany, awardXp };
}

beforeEach(() => {
  localDayInfo.mockReset();
  localDayInfo.mockReturnValue({ hour: 9, date: '2026-06-18', startOfDayMs: 1_000 });
});

describe('DailyLoginService.awardIfFirstToday', () => {
  it('awards tier-scaled XP and stamps the date on the first activity of the day', async () => {
    const { prisma, xpService, userUpdateMany, awardXp } = build({
      user: { timezone: 'Asia/Manila', workspaceMemberships: [{ workspace: { tier: 'PREMIUM' } }] },
    });
    const service = new DailyLoginService(prisma, xpService);

    const awarded = await service.awardIfFirstToday('u1');

    expect(localDayInfo).toHaveBeenCalledWith(expect.any(Date), 'Asia/Manila');
    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { id: 'u1', lastDailyXpDate: { not: '2026-06-18' } },
      data: { lastDailyXpDate: '2026-06-18' },
    });
    expect(awardXp).toHaveBeenCalledWith('u1', 'PREMIUM', XpEvent.DAILY_LOGIN, { date: '2026-06-18' });
    expect(awarded).toBe(true);
  });

  it('is a no-op when already awarded today (guard matched no rows)', async () => {
    const { prisma, xpService, awardXp } = build({ updateCount: 0 });
    const service = new DailyLoginService(prisma, xpService);

    const awarded = await service.awardIfFirstToday('u1');

    expect(awardXp).not.toHaveBeenCalled();
    expect(awarded).toBe(false);
  });

  it('falls back to UTC when the timezone is invalid', async () => {
    const { prisma, xpService } = build({
      user: { timezone: 'Not/AZone', workspaceMemberships: [{ workspace: { tier: 'FREE' } }] },
    });
    localDayInfo.mockReset();
    localDayInfo.mockImplementation((_now: Date, tz: string) => {
      if (tz === 'Not/AZone') throw new RangeError('bad tz');
      return { hour: 0, date: '2026-06-18', startOfDayMs: 0 };
    });
    const service = new DailyLoginService(prisma, xpService);

    await expect(service.awardIfFirstToday('u1')).resolves.toBe(true);
    expect(localDayInfo).toHaveBeenLastCalledWith(expect.any(Date), 'UTC');
  });

  it('does nothing when the user has no workspace membership', async () => {
    const { prisma, xpService, userUpdateMany, awardXp } = build({
      user: { timezone: 'UTC', workspaceMemberships: [] },
    });
    const service = new DailyLoginService(prisma, xpService);

    const awarded = await service.awardIfFirstToday('u1');

    expect(awarded).toBe(false);
    expect(userUpdateMany).not.toHaveBeenCalled();
    expect(awardXp).not.toHaveBeenCalled();
  });

  it('returns false when the user does not exist', async () => {
    const { prisma, xpService, awardXp } = build({ user: null });
    const service = new DailyLoginService(prisma, xpService);

    await expect(service.awardIfFirstToday('u1')).resolves.toBe(false);
    expect(awardXp).not.toHaveBeenCalled();
  });
});

describe('DailyLoginService.awardForContext', () => {
  it('awards from pre-loaded context without an extra findUnique', async () => {
    const { prisma, xpService, userFindUnique, userUpdateMany, awardXp } = build();
    const service = new DailyLoginService(prisma, xpService);

    const awarded = await service.awardForContext('u1', {
      timezone: 'Asia/Manila',
      tier: 'PRO',
      lastDailyXpDate: null,
    });

    expect(userFindUnique).not.toHaveBeenCalled();
    expect(localDayInfo).toHaveBeenCalledWith(expect.any(Date), 'Asia/Manila');
    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { id: 'u1', lastDailyXpDate: { not: '2026-06-18' } },
      data: { lastDailyXpDate: '2026-06-18' },
    });
    expect(awardXp).toHaveBeenCalledWith('u1', 'PRO', XpEvent.DAILY_LOGIN, { date: '2026-06-18' });
    expect(awarded).toBe(true);
  });

  it('short-circuits with no write when the context shows today already awarded', async () => {
    const { prisma, xpService, userFindUnique, userUpdateMany, awardXp } = build();
    const service = new DailyLoginService(prisma, xpService);

    const awarded = await service.awardForContext('u1', {
      timezone: 'UTC',
      tier: 'FREE',
      lastDailyXpDate: '2026-06-18',
    });

    expect(userFindUnique).not.toHaveBeenCalled();
    expect(userUpdateMany).not.toHaveBeenCalled();
    expect(awardXp).not.toHaveBeenCalled();
    expect(awarded).toBe(false);
  });

  it('returns false when the context has no tier', async () => {
    const { prisma, xpService, userUpdateMany, awardXp } = build();
    const service = new DailyLoginService(prisma, xpService);

    const awarded = await service.awardForContext('u1', {
      timezone: 'UTC',
      tier: null,
      lastDailyXpDate: null,
    });

    expect(awarded).toBe(false);
    expect(userUpdateMany).not.toHaveBeenCalled();
    expect(awardXp).not.toHaveBeenCalled();
  });
});
