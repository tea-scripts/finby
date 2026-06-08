import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { SubscriptionService } from './subscription.service';
import { SubscriptionRemindersService } from './subscription-reminders.service';

const NOW = new Date('2026-06-08T09:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const configMock = {
  get: jest.fn(() => 'https://chat.finby.app'),
} as unknown as ConfigService<Env, true>;

function buildPrisma() {
  return {
    subscription: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}) },
    workspaceMember: {
      findFirst: jest.fn().mockResolvedValue({ user: { email: 'owner@finby.app', displayName: 'Aisha' } }),
    },
  };
}

function buildEmail() {
  return { sendRenewalReminder: jest.fn().mockResolvedValue(undefined) };
}

function buildSubscriptions() {
  return { downgradeToFree: jest.fn().mockResolvedValue(undefined) };
}

function build(prisma = buildPrisma(), email = buildEmail(), subs = buildSubscriptions()) {
  const service = new SubscriptionRemindersService(
    prisma as unknown as PrismaService,
    email as unknown as EmailService,
    subs as unknown as SubscriptionService,
    configMock,
  );
  return { service, prisma, email, subs };
}

function sub(extra: Record<string, unknown> = {}) {
  return {
    id: 's1',
    workspaceId: 'w1',
    tier: 'PRO',
    status: 'ACTIVE',
    cancelAtPeriodEnd: true,
    currentPeriodEnd: new Date(NOW.getTime() + 5 * DAY),
    renewalReminder7SentAt: null,
    renewalReminder3SentAt: null,
    ...extra,
  };
}

describe('SubscriptionRemindersService.sendExpiryReminders', () => {
  it('sends a 7-day reminder for a plan ending in 5 days and marks the 7-day flag', async () => {
    const { service, prisma, email } = build();
    prisma.subscription.findMany.mockResolvedValue([sub({ currentPeriodEnd: new Date(NOW.getTime() + 5 * DAY) })]);

    await service.sendExpiryReminders(NOW);

    expect(email.sendRenewalReminder).toHaveBeenCalledWith(
      'owner@finby.app',
      'Aisha',
      5,
      '2026-06-13',
      'https://chat.finby.app/settings',
      'CANCELING',
    );
    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { renewalReminder7SentAt: NOW },
    });
  });

  it('sends a 3-day reminder (and PAST_DUE reason) for a payment-failed plan ending in 2 days', async () => {
    const { service, prisma, email } = build();
    prisma.subscription.findMany.mockResolvedValue([
      sub({ status: 'PAST_DUE', cancelAtPeriodEnd: false, currentPeriodEnd: new Date(NOW.getTime() + 2 * DAY) }),
    ]);

    await service.sendExpiryReminders(NOW);

    expect(email.sendRenewalReminder).toHaveBeenCalledWith(
      'owner@finby.app',
      'Aisha',
      2,
      expect.any(String),
      'https://chat.finby.app/settings',
      'PAST_DUE',
    );
    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { renewalReminder3SentAt: NOW },
    });
  });

  it('does not resend a stage already sent', async () => {
    const { service, prisma, email } = build();
    prisma.subscription.findMany.mockResolvedValue([
      sub({ currentPeriodEnd: new Date(NOW.getTime() + 2 * DAY), renewalReminder3SentAt: new Date(NOW.getTime() - DAY) }),
    ]);

    await service.sendExpiryReminders(NOW);

    expect(email.sendRenewalReminder).not.toHaveBeenCalled();
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it('skips and warns (no throw) when the workspace has no owner email', async () => {
    const { service, prisma, email } = build();
    prisma.subscription.findMany.mockResolvedValue([sub()]);
    prisma.workspaceMember.findFirst.mockResolvedValue(null);

    await service.sendExpiryReminders(NOW);

    expect(email.sendRenewalReminder).not.toHaveBeenCalled();
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it('queries only non-free, non-renewing or past-due subs within 7 days', async () => {
    const { service, prisma } = build();
    await service.sendExpiryReminders(NOW);

    const where = prisma.subscription.findMany.mock.calls[0]?.[0]?.where;
    expect(where.tier).toEqual({ not: 'FREE' });
    expect(where.currentPeriodEnd.lte).toEqual(new Date(NOW.getTime() + 7 * DAY));
    expect(where.OR).toEqual([
      { cancelAtPeriodEnd: true, status: { not: 'CANCELED' } },
      { status: 'PAST_DUE' },
    ]);
  });
});

describe('SubscriptionRemindersService.sweepExpired', () => {
  it('downgrades non-renewing subs past the 1-day grace cutoff', async () => {
    const { service, prisma, subs } = build();
    prisma.subscription.findMany.mockResolvedValue([{ workspaceId: 'w1' }, { workspaceId: 'w2' }]);

    await service.sweepExpired(NOW);

    expect(subs.downgradeToFree).toHaveBeenCalledWith('w1');
    expect(subs.downgradeToFree).toHaveBeenCalledWith('w2');

    const where = prisma.subscription.findMany.mock.calls[0]?.[0]?.where;
    expect(where.status).toEqual({ not: 'CANCELED' });
    expect(where.currentPeriodEnd.lt).toEqual(new Date(NOW.getTime() - DAY));
    expect(where.OR).toEqual([{ cancelAtPeriodEnd: true }, { status: 'PAST_DUE' }]);
  });

  it('one failed downgrade does not abort the rest', async () => {
    const { service, prisma, subs } = build();
    prisma.subscription.findMany.mockResolvedValue([{ workspaceId: 'w1' }, { workspaceId: 'w2' }]);
    subs.downgradeToFree.mockRejectedValueOnce(new Error('db down'));

    await service.sweepExpired(NOW);

    expect(subs.downgradeToFree).toHaveBeenCalledTimes(2);
  });
});
