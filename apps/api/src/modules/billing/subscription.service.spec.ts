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
    processedWebhookEvent: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
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
  eventId: 'evt_stripe_1',
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

  describe('status-only updates (invoice events — tier must never change)', () => {
    const pastDueEvent: BillingWebhookEvent = {
      type: 'SUBSCRIPTION_UPDATED',
      eventId: 'evt_stripe_2',
      workspaceId: 'w1',
      tier: null,
      status: 'PAST_DUE',
      providerCustomerId: 'cus_1',
      providerSubscriptionId: 'sub_1',
      currentPeriodStart: null,
      currentPeriodEnd: null,
    };

    it('PAST_DUE: updates only subscription.status and does NOT touch workspace.tier', async () => {
      const prisma = buildPrisma();
      prisma.subscription.findUnique.mockResolvedValue({ workspaceId: 'w1', tier: 'PRO', status: 'ACTIVE' });
      prisma.subscription.update.mockResolvedValue({});
      const { service } = build(prisma);

      await service.applyWebhookEvent('STRIPE', pastDueEvent);

      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: 'w1' }, data: { status: 'PAST_DUE' } }),
      );
      expect(prisma.workspace.update).not.toHaveBeenCalled();
      expect(prisma.subscription.upsert).not.toHaveBeenCalled();
    });

    it('ACTIVE (invoice.payment_succeeded): updates only subscription.status and does NOT touch workspace.tier', async () => {
      const prisma = buildPrisma();
      prisma.subscription.findUnique.mockResolvedValue({ workspaceId: 'w1', tier: 'PRO', status: 'PAST_DUE' });
      prisma.subscription.update.mockResolvedValue({});
      const { service } = build(prisma);

      await service.applyWebhookEvent('STRIPE', { ...pastDueEvent, status: 'ACTIVE' });

      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: 'w1' }, data: { status: 'ACTIVE' } }),
      );
      expect(prisma.workspace.update).not.toHaveBeenCalled();
      expect(prisma.subscription.upsert).not.toHaveBeenCalled();
    });

    it('no-op when no subscription row exists yet (status before checkout completes)', async () => {
      const prisma = buildPrisma();
      prisma.subscription.findUnique.mockResolvedValue(null);
      const { service } = build(prisma);

      await service.applyWebhookEvent('STRIPE', pastDueEvent);

      expect(prisma.subscription.update).not.toHaveBeenCalled();
      expect(prisma.workspace.update).not.toHaveBeenCalled();
      expect(prisma.subscription.upsert).not.toHaveBeenCalled();
      expect(prisma.processedWebhookEvent.create).not.toHaveBeenCalled();
    });
  });
});

describe('SubscriptionService.applyWebhookEvent — idempotency', () => {
  it('first delivery (findUnique → null): applies the event and records processedWebhookEvent', async () => {
    const prisma = buildPrisma();
    prisma.processedWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.subscription.upsert.mockResolvedValue({});
    prisma.workspace.update.mockResolvedValue({});
    const { service } = build(prisma);

    await service.applyWebhookEvent('STRIPE', activeEvent);

    expect(prisma.subscription.upsert).toHaveBeenCalled();
    expect(prisma.workspace.update).toHaveBeenCalled();
    expect(prisma.processedWebhookEvent.create).toHaveBeenCalledWith({
      data: { provider: 'STRIPE', eventId: 'evt_stripe_1' },
    });
  });

  it('duplicate delivery (findUnique → existing row): returns early with no writes', async () => {
    const prisma = buildPrisma();
    prisma.processedWebhookEvent.findUnique.mockResolvedValue({ id: 'pwe_1', provider: 'STRIPE', eventId: 'evt_stripe_1', createdAt: new Date() });
    const { service } = build(prisma);

    await service.applyWebhookEvent('STRIPE', activeEvent);

    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
    expect(prisma.workspace.update).not.toHaveBeenCalled();
    expect(prisma.processedWebhookEvent.create).not.toHaveBeenCalled();
  });

  it('eventId: null (fallback provider): applies normally without touching processedWebhookEvent', async () => {
    const prisma = buildPrisma();
    prisma.subscription.upsert.mockResolvedValue({});
    prisma.workspace.update.mockResolvedValue({});
    const { service } = build(prisma);

    await service.applyWebhookEvent('PAYSTACK', { ...activeEvent, eventId: null });

    expect(prisma.subscription.upsert).toHaveBeenCalled();
    expect(prisma.workspace.update).toHaveBeenCalled();
    expect(prisma.processedWebhookEvent.findUnique).not.toHaveBeenCalled();
    expect(prisma.processedWebhookEvent.create).not.toHaveBeenCalled();
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
