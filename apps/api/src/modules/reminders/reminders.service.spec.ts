import { DEFAULT_PREFERENCES } from '@finby/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PushService } from '../push/push.service';
import { RemindersService } from './reminders.service';

// 20:00 UTC -> matches REMINDER_HOUR (20) for a UTC user.
const AT_8PM_UTC = new Date('2026-06-10T20:00:00Z');

interface MockUser {
  id: string;
  displayName: string;
  timezone: string;
  preferences: unknown;
  currentStreak: number;
}

/**
 * lastTxnAt: per-user map of their most recent transaction's createdAt timestamp.
 * When provided, the transaction.findFirst mock returns a row only when that
 * timestamp is >= where.createdAt.gte, exercising the actual date-window filter.
 * When absent, falls back to the legacy loggedUserIds Set behaviour.
 */
/** Optional spending-summary fixture for the "active today" path. */
interface SummaryFixture {
  /** Expense total + count the aggregate returns. count 0 => no summary. */
  total?: string;
  count?: number;
  currency?: string;
  topCategoryName?: string | null;
}

function setup(opts: {
  users: MockUser[];
  loggedUserIds?: string[];
  lastTxnAt?: Record<string, Date>;
  summary?: SummaryFixture;
}) {
  const sendToUserDevices = jest.fn().mockResolvedValue(undefined);
  const update = jest.fn().mockResolvedValue({});
  const logged = new Set(opts.loggedUserIds ?? []);
  const summary = opts.summary ?? {};
  const currency = summary.currency ?? 'USD';

  const prisma = {
    pushSubscription: {
      findMany: jest.fn().mockResolvedValue(opts.users.map((u) => ({ userId: u.id }))),
    },
    user: {
      findMany: jest.fn().mockResolvedValue(opts.users),
      update,
    },
    transaction: {
      findFirst: jest.fn(
        ({ where }: { where: { loggedByUserId: string; createdAt?: { gte?: Date } } }) => {
          const userId = where.loggedByUserId;
          const active = { currencyBase: currency };

          if (opts.lastTxnAt) {
            const txnDate = opts.lastTxnAt[userId];
            const gte = where.createdAt?.gte;
            if (!txnDate) return Promise.resolve(null);
            if (gte && txnDate >= gte) return Promise.resolve(active);
            return Promise.resolve(null);
          }

          // Legacy path: treat presence in the set as "has a transaction today"
          return Promise.resolve(logged.has(userId) ? active : null);
        },
      ),
      aggregate: jest.fn().mockResolvedValue({
        _sum: { amountBase: summary.total ?? null },
        _count: summary.count ?? 0,
      }),
      groupBy: jest
        .fn()
        .mockResolvedValue(
          summary.topCategoryName ? [{ categoryId: 'c1', _sum: { amountBase: summary.total } }] : [],
        ),
    },
    category: {
      findUnique: jest.fn().mockResolvedValue(
        summary.topCategoryName ? { name: summary.topCategoryName } : null,
      ),
    },
  } as unknown as PrismaService;

  const push = { sendToUserDevices } as unknown as PushService;
  const service = new RemindersService(prisma, push);
  return { service, sendToUserDevices, update };
}

const baseUser: MockUser = {
  id: 'u1',
  displayName: 'Tea',
  timezone: 'UTC',
  preferences: DEFAULT_PREFERENCES,
  currentStreak: 0,
};

describe('RemindersService.sendDailyReminders', () => {
  it('pushes to an inactive user at 8pm local and stamps lastDailyReminderAt', async () => {
    const { service, sendToUserDevices, update } = setup({ users: [baseUser] });
    await service.sendDailyReminders(AT_8PM_UTC);

    expect(sendToUserDevices).toHaveBeenCalledTimes(1);
    expect(sendToUserDevices).toHaveBeenCalledWith('u1', expect.objectContaining({ url: '/chat' }));
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: expect.objectContaining({
          preferences: expect.objectContaining({ lastDailyReminderAt: '2026-06-10' }),
        }),
      }),
    );
  });

  it('skips users whose local hour is not 8pm', async () => {
    const tokyo: MockUser = { ...baseUser, timezone: 'Asia/Tokyo' };
    const { service, sendToUserDevices } = setup({ users: [tokyo] });
    await service.sendDailyReminders(AT_8PM_UTC);
    expect(sendToUserDevices).not.toHaveBeenCalled();
  });

  it('sends a daily summary (to /dashboard) to a user who logged today', async () => {
    const { service, sendToUserDevices, update } = setup({
      users: [baseUser],
      loggedUserIds: ['u1'],
      summary: { total: '42.5', count: 3, currency: 'USD', topCategoryName: 'Groceries' },
    });
    await service.sendDailyReminders(AT_8PM_UTC);

    expect(sendToUserDevices).toHaveBeenCalledTimes(1);
    expect(sendToUserDevices).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ url: '/dashboard' }),
    );
    const payload = sendToUserDevices.mock.calls[0]![1] as { body: string };
    expect(payload.body).toContain('$42.5');
    expect(payload.body).toContain('Groceries');
    // Still stamps so the summary only fires once per day.
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: expect.objectContaining({
          preferences: expect.objectContaining({ lastDailyReminderAt: '2026-06-10' }),
        }),
      }),
    );
  });

  it('includes the streak in the summary body when streak >= 2', async () => {
    const streaker: MockUser = { ...baseUser, currentStreak: 6 };
    const { service, sendToUserDevices } = setup({
      users: [streaker],
      loggedUserIds: ['u1'],
      summary: { total: '100', count: 2, currency: 'USD', topCategoryName: 'Food' },
    });
    await service.sendDailyReminders(AT_8PM_UTC);

    const payload = sendToUserDevices.mock.calls[0]![1] as { body: string };
    expect(payload.body).toContain('🔥 6-day streak');
  });

  it('falls back to the reminder nudge when the day has no summarisable spend', async () => {
    // Active today (findFirst matches) but the expense aggregate is empty
    // (e.g. only income logged) -> getDailySummary returns null -> reminder path.
    const { service, sendToUserDevices } = setup({
      users: [baseUser],
      loggedUserIds: ['u1'],
      summary: { count: 0 },
    });
    await service.sendDailyReminders(AT_8PM_UTC);

    expect(sendToUserDevices).toHaveBeenCalledTimes(1);
    expect(sendToUserDevices).toHaveBeenCalledWith('u1', expect.objectContaining({ url: '/chat' }));
  });

  it('skips users who turned daily reminders off', async () => {
    const optedOut: MockUser = {
      ...baseUser,
      preferences: { ...DEFAULT_PREFERENCES, dailyReminders: false },
    };
    const { service, sendToUserDevices, update } = setup({ users: [optedOut] });
    await service.sendDailyReminders(AT_8PM_UTC);
    expect(sendToUserDevices).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('skips users already nudged today (idempotency stamp)', async () => {
    const stamped: MockUser = {
      ...baseUser,
      preferences: { ...DEFAULT_PREFERENCES, lastDailyReminderAt: '2026-06-10' },
    };
    const { service, sendToUserDevices, update } = setup({ users: [stamped] });
    await service.sendDailyReminders(AT_8PM_UTC);
    expect(sendToUserDevices).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('no-ops entirely when push is not configured/injected', async () => {
    const prisma = { pushSubscription: { findMany: jest.fn() } } as unknown as PrismaService;
    const service = new RemindersService(prisma);
    await service.sendDailyReminders(AT_8PM_UTC);
    expect(prisma.pushSubscription.findMany).not.toHaveBeenCalled();
  });

  it('nudges a user whose only transaction was yesterday (before local midnight)', async () => {
    // UTC user at 20:00 UTC. Local midnight = 2026-06-10T00:00:00Z.
    // Transaction at 2026-06-09T23:00:00Z is BEFORE midnight -> should still get nudged.
    const { service, sendToUserDevices } = setup({
      users: [baseUser],
      lastTxnAt: { u1: new Date('2026-06-09T23:00:00Z') },
    });
    await service.sendDailyReminders(AT_8PM_UTC);
    expect(sendToUserDevices).toHaveBeenCalledTimes(1);
    expect(sendToUserDevices).toHaveBeenCalledWith('u1', expect.objectContaining({ url: '/chat' }));
  });

  it('sends a summary (not a nudge) to a user who logged after local midnight today', async () => {
    // Same UTC user, transaction at 08:00 UTC today is AFTER midnight -> active -> summary.
    const { service, sendToUserDevices } = setup({
      users: [baseUser],
      lastTxnAt: { u1: new Date('2026-06-10T08:00:00Z') },
      summary: { total: '10', count: 1, currency: 'USD', topCategoryName: null },
    });
    await service.sendDailyReminders(AT_8PM_UTC);
    expect(sendToUserDevices).toHaveBeenCalledTimes(1);
    expect(sendToUserDevices).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ url: '/dashboard' }),
    );
  });

  it('multi-user mix: nudges only the inactive user and stamps only them', async () => {
    const userA: MockUser = { ...baseUser, id: 'uA', displayName: 'Alice' };
    // userB is already stamped today
    const userB: MockUser = {
      ...baseUser,
      id: 'uB',
      displayName: 'Bob',
      preferences: { ...DEFAULT_PREFERENCES, lastDailyReminderAt: '2026-06-10' },
    };

    const { service, sendToUserDevices, update } = setup({
      users: [userA, userB],
    });
    await service.sendDailyReminders(AT_8PM_UTC);

    expect(sendToUserDevices).toHaveBeenCalledTimes(1);
    expect(sendToUserDevices).toHaveBeenCalledWith('uA', expect.objectContaining({ url: '/chat' }));
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'uA' } }));
  });

  it('invalid-timezone falls back to UTC and still sends the nudge', async () => {
    const badTz: MockUser = { ...baseUser, timezone: 'Bogus/Zone' };
    const { service, sendToUserDevices } = setup({ users: [badTz] });
    // Should not throw, and since UTC fallback puts the user at 20:00, should nudge.
    await expect(service.sendDailyReminders(AT_8PM_UTC)).resolves.toBeUndefined();
    expect(sendToUserDevices).toHaveBeenCalledTimes(1);
    expect(sendToUserDevices).toHaveBeenCalledWith('u1', expect.objectContaining({ url: '/chat' }));
  });
});
