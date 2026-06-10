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

function setup(opts: { users: MockUser[]; loggedUserIds?: string[] }) {
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
      findFirst: jest.fn(({ where }: { where: { loggedByUserId: string } }) =>
        Promise.resolve(logged.has(where.loggedByUserId) ? { id: 't1' } : null),
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
    const { service, sendToUserDevices } = setup({ users: [baseUser], loggedUserIds: ['u1'] });
    await service.sendDailyReminders(AT_8PM_UTC);
    expect(sendToUserDevices).not.toHaveBeenCalled();
  });

  it('skips users who turned daily reminders off', async () => {
    const optedOut: MockUser = { ...baseUser, preferences: { ...DEFAULT_PREFERENCES, dailyReminders: false } };
    const { service, sendToUserDevices } = setup({ users: [optedOut] });
    await service.sendDailyReminders(AT_8PM_UTC);
    expect(sendToUserDevices).not.toHaveBeenCalled();
  });

  it('skips users already nudged today (idempotency stamp)', async () => {
    const stamped: MockUser = { ...baseUser, preferences: { ...DEFAULT_PREFERENCES, lastDailyReminderAt: '2026-06-10' } };
    const { service, sendToUserDevices } = setup({ users: [stamped] });
    await service.sendDailyReminders(AT_8PM_UTC);
    expect(sendToUserDevices).not.toHaveBeenCalled();
  });

  it('no-ops entirely when push is not configured/injected', async () => {
    const prisma = { pushSubscription: { findMany: jest.fn() } } as unknown as PrismaService;
    const service = new RemindersService(prisma);
    await service.sendDailyReminders(AT_8PM_UTC);
    expect(prisma.pushSubscription.findMany).not.toHaveBeenCalled();
  });
});
