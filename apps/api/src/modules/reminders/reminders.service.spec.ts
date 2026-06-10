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
}

/**
 * lastTxnAt: per-user map of their most recent transaction's createdAt timestamp.
 * When provided, the transaction.findFirst mock returns a row only when that
 * timestamp is >= where.createdAt.gte, exercising the actual date-window filter.
 * When absent, falls back to the legacy loggedUserIds Set behaviour.
 */
function setup(opts: {
  users: MockUser[];
  loggedUserIds?: string[];
  lastTxnAt?: Record<string, Date>;
}) {
  const sendToUserDevices = jest.fn().mockResolvedValue(undefined);
  const update = jest.fn().mockResolvedValue({});
  const logged = new Set(opts.loggedUserIds ?? []);

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

          if (opts.lastTxnAt) {
            const txnDate = opts.lastTxnAt[userId];
            const gte = where.createdAt?.gte;
            if (!txnDate) return Promise.resolve(null);
            if (gte && txnDate >= gte) return Promise.resolve({ id: 't1' });
            return Promise.resolve(null);
          }

          // Legacy path: treat presence in the set as "has a transaction today"
          return Promise.resolve(logged.has(userId) ? { id: 't1' } : null);
        },
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

  it('skips users who already logged a transaction today', async () => {
    const { service, sendToUserDevices, update } = setup({
      users: [baseUser],
      loggedUserIds: ['u1'],
    });
    await service.sendDailyReminders(AT_8PM_UTC);
    expect(sendToUserDevices).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
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

  it('does not nudge a user who logged after local midnight today', async () => {
    // Same UTC user, transaction at 08:00 UTC today is AFTER midnight -> no nudge.
    const { service, sendToUserDevices } = setup({
      users: [baseUser],
      lastTxnAt: { u1: new Date('2026-06-10T08:00:00Z') },
    });
    await service.sendDailyReminders(AT_8PM_UTC);
    expect(sendToUserDevices).not.toHaveBeenCalled();
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
