import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import type { EmailService } from '../email/email.service';
import type { Env } from '../../config/env.schema';
import { EarlyReminderService } from './early-reminder.service';

// 20:00 UTC -> matches SEND_HOUR (20) for a UTC user.
const AT_8PM_UTC = new Date('2026-06-10T20:00:00Z');

interface MockUser {
  id: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  timezone: string;
  currentStreak: number;
  preferences: unknown;
}

const newUser = (id: string, over: Partial<MockUser> = {}): MockUser => ({
  id,
  displayName: 'Alex',
  email: `${id}@x.com`,
  emailVerified: true,
  timezone: 'UTC',
  currentStreak: 1,
  preferences: {},
  ...over,
});

function setup(opts: {
  users?: MockUser[];
  pushUserIds?: string[];
  loggedTodayUserIds?: string[];
}) {
  const loggedToday = new Set(opts.loggedTodayUserIds ?? []);
  const prisma = {
    user: {
      findMany: jest.fn().mockResolvedValue(opts.users ?? []),
      update: jest.fn().mockResolvedValue({}),
    },
    pushSubscription: {
      findMany: jest.fn().mockResolvedValue((opts.pushUserIds ?? []).map((userId) => ({ userId }))),
    },
    transaction: {
      findFirst: jest.fn((args: { where: { loggedByUserId: string } }) =>
        Promise.resolve(loggedToday.has(args.where.loggedByUserId) ? { id: 'tx' } : null),
      ),
    },
  };
  const email = { sendEarlyReminder: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn().mockReturnValue('https://chat.finby.app') };

  const service = new EarlyReminderService(
    prisma as unknown as PrismaService,
    email as unknown as EmailService,
    config as unknown as ConfigService<Env, true>,
  );
  return { service, prisma, email };
}

describe('EarlyReminderService', () => {
  it('emails a new, verified, push-less user who has not logged today, and stamps', async () => {
    const { service, prisma, email } = setup({ users: [newUser('u1', { currentStreak: 2 })] });

    await service.sendEarlyReminders(AT_8PM_UTC);

    expect(email.sendEarlyReminder).toHaveBeenCalledWith(
      'u1@x.com',
      'Alex',
      2,
      'https://chat.finby.app/chat',
    );
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
  });

  it('skips users who have a push subscription', async () => {
    const { service, email } = setup({ users: [newUser('u1')], pushUserIds: ['u1'] });
    await service.sendEarlyReminders(AT_8PM_UTC);
    expect(email.sendEarlyReminder).not.toHaveBeenCalled();
  });

  it('skips users who already logged a transaction today', async () => {
    const { service, email } = setup({ users: [newUser('u1')], loggedTodayUserIds: ['u1'] });
    await service.sendEarlyReminders(AT_8PM_UTC);
    expect(email.sendEarlyReminder).not.toHaveBeenCalled();
  });

  it('skips when it is not the send hour locally', async () => {
    const { service, email } = setup({ users: [newUser('u1')] });
    await service.sendEarlyReminders(new Date('2026-06-10T10:00:00Z'));
    expect(email.sendEarlyReminder).not.toHaveBeenCalled();
  });

  it('respects the dailyReminders=false opt-out', async () => {
    const { service, email } = setup({
      users: [newUser('u1', { preferences: { dailyReminders: false } })],
    });
    await service.sendEarlyReminders(AT_8PM_UTC);
    expect(email.sendEarlyReminder).not.toHaveBeenCalled();
  });

  it('respects the every-other-day gap', async () => {
    const yesterday = new Date(AT_8PM_UTC.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const { service, email } = setup({
      users: [newUser('u1', { preferences: { lastEarlyReminderAt: yesterday } })],
    });
    await service.sendEarlyReminders(AT_8PM_UTC);
    expect(email.sendEarlyReminder).not.toHaveBeenCalled();
  });

  it('skips unverified users', async () => {
    const { service, email } = setup({ users: [newUser('u1', { emailVerified: false })] });
    await service.sendEarlyReminders(AT_8PM_UTC);
    expect(email.sendEarlyReminder).not.toHaveBeenCalled();
  });
});
