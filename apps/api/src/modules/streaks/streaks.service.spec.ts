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
}

function setup(user: StreakUser | null) {
  const update = jest.fn().mockResolvedValue({});
  const findUnique = jest.fn().mockResolvedValue(user);
  const prisma = { user: { findUnique, update } } as unknown as PrismaService;
  const service = new StreaksService(prisma);
  return { service, update, findUnique };
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
