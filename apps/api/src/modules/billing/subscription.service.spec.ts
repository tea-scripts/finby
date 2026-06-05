import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionService } from './subscription.service';
import type { BillingProvider, BillingWebhookEvent } from './billing.types';

const configMock = {
  get: jest.fn(() => 'http://localhost:3000'),
} as unknown as ConfigService<Env, true>;

function buildPrisma() {
  const client = {
    subscription: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
    workspace: { findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  };
  client.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function' ? (arg as (c: typeof client) => unknown)(client) : Promise.all(arg as unknown[]),
  );
  return client;
}

function stripeMock(): BillingProvider {
  return {
    name: 'STRIPE',
    createCheckout: jest.fn().mockResolvedValue({ url: 'https://checkout.stripe/x' }),
    parseWebhook: jest.fn(),
    cancelAtPeriodEnd: jest.fn().mockResolvedValue(undefined),
  };
}

function build(prisma = buildPrisma(), stripe = stripeMock()) {
  const paystack = { ...stripeMock(), name: 'PAYSTACK' as const };
  const lemonsqueezy = { ...stripeMock(), name: 'LEMONSQUEEZY' as const };
  const service = new SubscriptionService(
    prisma as unknown as PrismaService,
    configMock,
    stripe,
    paystack,
    lemonsqueezy,
  );
  return { service, prisma, stripe, paystack, lemonsqueezy };
}

const activeEvent: BillingWebhookEvent = {
  type: 'SUBSCRIPTION_ACTIVE',
  workspaceId: 'w1',
  tier: 'PRO',
  status: 'ACTIVE',
  providerCustomerId: 'cus_1',
  providerSubscriptionId: 'sub_1',
  currentPeriodStart: new Date('2026-06-01T00:00:00Z'),
  currentPeriodEnd: new Date('2026-07-01T00:00:00Z'),
};

describe('SubscriptionService.getSubscription', () => {
  it('synthesizes a FREE/ACTIVE view when there is no subscription row', async () => {
    const prisma = buildPrisma();
    prisma.subscription.findUnique.mockResolvedValue(null);
    prisma.workspace.findUnique.mockResolvedValue({ tier: 'FREE' });
    const { service } = build(prisma);

    const view = await service.getSubscription('w1');
    expect(view).toMatchObject({ tier: 'FREE', status: 'ACTIVE', billingProvider: null });
  });

  it('maps an existing subscription row', async () => {
    const prisma = buildPrisma();
    prisma.subscription.findUnique.mockResolvedValue({
      tier: 'PRO',
      status: 'ACTIVE',
      billingProvider: 'STRIPE',
      currentPeriodEnd: new Date('2026-07-01T00:00:00Z'),
      cancelAtPeriodEnd: false,
    });
    const { service } = build(prisma);

    const view = await service.getSubscription('w1');
    expect(view).toMatchObject({ tier: 'PRO', status: 'ACTIVE', billingProvider: 'STRIPE', cancelAtPeriodEnd: false });
  });
});

describe('SubscriptionService.applyWebhookEvent', () => {
  it('on SUBSCRIPTION_ACTIVE upserts the subscription and flips workspace.tier', async () => {
    const prisma = buildPrisma();
    prisma.subscription.upsert.mockResolvedValue({});
    prisma.workspace.update.mockResolvedValue({});
    const { service } = build(prisma);

    await service.applyWebhookEvent('STRIPE', activeEvent);

    expect(prisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: 'w1' } }),
    );
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'w1' }, data: expect.objectContaining({ tier: 'PRO' }) }),
    );
  });

  it('sets maxMembers=5 for the FAMILY tier', async () => {
    const prisma = buildPrisma();
    const { service } = build(prisma);
    await service.applyWebhookEvent('STRIPE', { ...activeEvent, tier: 'FAMILY' });
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tier: 'FAMILY', maxMembers: 5 }) }),
    );
  });

  it('on SUBSCRIPTION_CANCELED downgrades workspace.tier to FREE', async () => {
    const prisma = buildPrisma();
    const { service } = build(prisma);
    await service.applyWebhookEvent('STRIPE', {
      ...activeEvent,
      type: 'SUBSCRIPTION_CANCELED',
      tier: 'FREE',
      status: 'CANCELED',
    });
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tier: 'FREE', maxMembers: 1 }) }),
    );
  });

  it('ignores IGNORED events', async () => {
    const prisma = buildPrisma();
    const { service } = build(prisma);
    await service.applyWebhookEvent('STRIPE', { ...activeEvent, type: 'IGNORED', workspaceId: null });
    expect(prisma.workspace.update).not.toHaveBeenCalled();
    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
  });
});

describe('SubscriptionService.createCheckout', () => {
  it('delegates to the selected provider', async () => {
    const { service, stripe } = build();
    const result = await service.createCheckout('w1', 'a@b.com', 'PRO', 'STRIPE');
    expect(stripe.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'w1', tier: 'PRO', customerEmail: 'a@b.com' }),
    );
    expect(result.url).toContain('checkout.stripe');
  });
});
