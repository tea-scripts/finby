import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PushService } from '../push/push.service';
import type { EmailService } from '../email/email.service';
import type { Env } from '../../config/env.schema';
import { ReengagementService } from './reengagement.service';

// 19:00 UTC -> matches SEND_HOUR (19) for a UTC user.
const AT_7PM_UTC = new Date('2026-06-10T19:00:00Z');

interface MockUser {
  id: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  timezone: string;
  preferences: unknown;
}

const lapsedUser = (id: string, over: Partial<MockUser> = {}): MockUser => ({
  id,
  displayName: 'Alex',
  email: `${id}@x.com`,
  emailVerified: true,
  timezone: 'UTC',
  preferences: {},
  ...over,
});

function setup(opts: {
  users?: MockUser[];
  activeTokenUserIds?: string[];
  activeTxUserIds?: string[];
  pushUserIds?: string[];
}) {
  const prisma = {
    refreshToken: {
      findMany: jest
        .fn()
        .mockResolvedValue((opts.activeTokenUserIds ?? []).map((userId) => ({ userId }))),
    },
    transaction: {
      findMany: jest
        .fn()
        .mockResolvedValue((opts.activeTxUserIds ?? []).map((id) => ({ loggedByUserId: id }))),
    },
    user: {
      findMany: jest.fn().mockResolvedValue(opts.users ?? []),
      update: jest.fn().mockResolvedValue({}),
    },
    pushSubscription: {
      findMany: jest.fn().mockResolvedValue((opts.pushUserIds ?? []).map((userId) => ({ userId }))),
    },
  };
  const email = { sendReengagement: jest.fn().mockResolvedValue(undefined) };
  const push = { sendToUserDevices: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn().mockReturnValue('https://chat.finby.app') };

  const service = new ReengagementService(
    prisma as unknown as PrismaService,
    email as unknown as EmailService,
    config as unknown as ConfigService<Env, true>,
    push as unknown as PushService,
  );
  return { service, prisma, email, push };
}

describe('ReengagementService', () => {
  it('emails a lapsed, verified, push-less user and stamps lastReengagedAt', async () => {
    const { service, prisma, email, push } = setup({ users: [lapsedUser('u1')] });

    await service.sendReengagementNudges(AT_7PM_UTC);

    expect(email.sendReengagement).toHaveBeenCalledWith('u1@x.com', 'Alex', 'https://chat.finby.app/chat');
    expect(push.sendToUserDevices).not.toHaveBeenCalled();
    const update = prisma.user.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'u1' });
    expect(update.data.preferences.lastReengagedAt).toBe(AT_7PM_UTC.toISOString());
  });

  it('pushes instead of emailing when the user has a subscription, and suppresses that evening\'s daily nudge', async () => {
    const { service, prisma, email, push } = setup({
      users: [lapsedUser('u1')],
      pushUserIds: ['u1'],
    });

    await service.sendReengagementNudges(AT_7PM_UTC);

    expect(push.sendToUserDevices).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ title: 'Finby', url: '/chat' }),
    );
    expect(email.sendReengagement).not.toHaveBeenCalled();
    const prefs = prisma.user.update.mock.calls[0][0].data.preferences;
    expect(prefs.lastReengagedAt).toBe(AT_7PM_UTC.toISOString());
    expect(prefs.lastDailyReminderAt).toBe('2026-06-10');
  });

  it('skips users nudged within the 30-day cooldown', async () => {
    const { service, prisma, email } = setup({
      users: [lapsedUser('u1', { preferences: { lastReengagedAt: '2026-06-01T19:00:00.000Z' } })],
    });

    await service.sendReengagementNudges(AT_7PM_UTC);

    expect(email.sendReengagement).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('re-nudges once the cooldown has passed', async () => {
    const { service, email } = setup({
      users: [lapsedUser('u1', { preferences: { lastReengagedAt: '2026-04-20T19:00:00.000Z' } })],
    });

    await service.sendReengagementNudges(AT_7PM_UTC);

    expect(email.sendReengagement).toHaveBeenCalledTimes(1);
  });

  it('respects the dailyReminders opt-out for both channels', async () => {
    const { service, email, push } = setup({
      users: [lapsedUser('u1', { preferences: { dailyReminders: false } })],
      pushUserIds: ['u1'],
    });

    await service.sendReengagementNudges(AT_7PM_UTC);

    expect(email.sendReengagement).not.toHaveBeenCalled();
    expect(push.sendToUserDevices).not.toHaveBeenCalled();
  });

  it('only sends at the local send hour', async () => {
    const { service, email } = setup({ users: [lapsedUser('u1')] });

    await service.sendReengagementNudges(new Date('2026-06-10T18:00:00Z'));

    expect(email.sendReengagement).not.toHaveBeenCalled();
  });

  it('uses the user\'s timezone for the send-hour gate', async () => {
    // 11:00 UTC is 19:00 in Asia/Manila (UTC+8).
    const { service, email } = setup({
      users: [lapsedUser('u1', { timezone: 'Asia/Manila' })],
    });

    await service.sendReengagementNudges(new Date('2026-06-10T11:00:00Z'));

    expect(email.sendReengagement).toHaveBeenCalledTimes(1);
  });

  it('skips unverified-email users that have no push subscription', async () => {
    const { service, prisma, email, push } = setup({
      users: [lapsedUser('u1', { emailVerified: false })],
    });

    await service.sendReengagementNudges(AT_7PM_UTC);

    expect(email.sendReengagement).not.toHaveBeenCalled();
    expect(push.sendToUserDevices).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('excludes recently active users (token refresh or logged transaction) from the candidate query', async () => {
    const { service, prisma } = setup({
      users: [],
      activeTokenUserIds: ['a1'],
      activeTxUserIds: ['a2'],
    });

    await service.sendReengagementNudges(AT_7PM_UTC);

    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.id.notIn).toEqual(expect.arrayContaining(['a1', 'a2']));
    expect(where.createdAt.lt).toEqual(new Date('2026-06-03T19:00:00Z'));
  });

  it('keeps nudging other users when one user errors', async () => {
    const { service, email } = setup({ users: [lapsedUser('u1'), lapsedUser('u2')] });
    email.sendReengagement.mockRejectedValueOnce(new Error('smtp down'));

    await service.sendReengagementNudges(AT_7PM_UTC);

    expect(email.sendReengagement).toHaveBeenCalledTimes(2);
    expect(email.sendReengagement).toHaveBeenLastCalledWith(
      'u2@x.com',
      'Alex',
      'https://chat.finby.app/chat',
    );
  });
});
