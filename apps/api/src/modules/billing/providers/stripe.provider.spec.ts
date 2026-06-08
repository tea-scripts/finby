import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.schema';
import { StripeProvider } from './stripe.provider';

function makeConfig(): ConfigService<Env, true> {
  const values: Record<string, string> = {
    STRIPE_SECRET_KEY: 'sk_test_stub',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
  };
  return { get: (k: string) => values[k] } as unknown as ConfigService<Env, true>;
}

/** Reach into the private stripe instance to stub constructEvent. */
function stubConstructEvent(
  provider: StripeProvider,
  returnValue: unknown,
): jest.Mock {
  const privateProvider = provider as unknown as {
    stripe: { webhooks: { constructEvent: jest.Mock } };
  };
  const mock = jest.fn().mockReturnValue(returnValue);
  privateProvider.stripe.webhooks.constructEvent = mock;
  return mock;
}

/** Reach into the private stripe instance to stub billingPortal.sessions.create. */
function stubBillingPortalCreate(
  provider: StripeProvider,
  returnValue: unknown,
): jest.Mock {
  const privateProvider = provider as unknown as {
    stripe: { billingPortal: { sessions: { create: jest.Mock } } };
  };
  const mock = jest.fn().mockResolvedValue(returnValue);
  privateProvider.stripe.billingPortal = { sessions: { create: mock } };
  return mock;
}

describe('StripeProvider.createPortalSession', () => {
  it('calls billingPortal.sessions.create with correct params and returns url', async () => {
    const provider = new StripeProvider(makeConfig());
    const createMock = stubBillingPortalCreate(provider, { url: 'https://billing.stripe.com/session/abc' });

    const result = await provider.createPortalSession({
      providerCustomerId: 'cus_test',
      returnUrl: 'https://app.finby.io/settings',
    });

    expect(createMock).toHaveBeenCalledWith({
      customer: 'cus_test',
      return_url: 'https://app.finby.io/settings',
    });
    expect(result).toEqual({ url: 'https://billing.stripe.com/session/abc' });
  });

  it('throws ServiceUnavailableException when session.url is missing', async () => {
    const provider = new StripeProvider(makeConfig());
    stubBillingPortalCreate(provider, { url: null });

    await expect(
      provider.createPortalSession({ providerCustomerId: 'cus_test', returnUrl: 'https://app.finby.io/settings' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('StripeProvider.parseWebhook — invoice events', () => {
  it('invoice.payment_failed → SUBSCRIPTION_UPDATED / PAST_DUE / tier:null', async () => {
    const provider = new StripeProvider(makeConfig());
    stubConstructEvent(provider, {
      type: 'invoice.payment_failed',
      data: {
        object: {
          subscription_details: { metadata: { workspaceId: 'w1', tier: 'PRO' } },
          subscription: 'sub_abc',
          customer: 'cus_abc',
          parent: null,
        },
      },
    });

    const event = await provider.parseWebhook(Buffer.from('body'), 'sig');
    expect(event).toMatchObject({
      type: 'SUBSCRIPTION_UPDATED',
      status: 'PAST_DUE',
      tier: null,
      workspaceId: 'w1',
      providerSubscriptionId: 'sub_abc',
      providerCustomerId: 'cus_abc',
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });
  });

  it('invoice.payment_succeeded → SUBSCRIPTION_UPDATED / ACTIVE / tier:null', async () => {
    const provider = new StripeProvider(makeConfig());
    stubConstructEvent(provider, {
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          subscription_details: { metadata: { workspaceId: 'w1', tier: 'PRO' } },
          subscription: 'sub_abc',
          customer: 'cus_abc',
          parent: null,
        },
      },
    });

    const event = await provider.parseWebhook(Buffer.from('body'), 'sig');
    expect(event).toMatchObject({
      type: 'SUBSCRIPTION_UPDATED',
      status: 'ACTIVE',
      tier: null,
      workspaceId: 'w1',
    });
  });

  it('invoice with no workspaceId in metadata → IGNORED', async () => {
    const provider = new StripeProvider(makeConfig());
    stubConstructEvent(provider, {
      type: 'invoice.payment_failed',
      data: {
        object: {
          subscription_details: { metadata: {} },
          subscription: 'sub_abc',
          customer: 'cus_abc',
          parent: null,
        },
      },
    });

    const event = await provider.parseWebhook(Buffer.from('body'), 'sig');
    expect(event.type).toBe('IGNORED');
  });

  it('invoice with workspaceId in parent.subscription_details → extracted correctly', async () => {
    const provider = new StripeProvider(makeConfig());
    stubConstructEvent(provider, {
      type: 'invoice.payment_failed',
      data: {
        object: {
          subscription_details: null,
          subscription: 'sub_xyz',
          customer: 'cus_xyz',
          parent: { subscription_details: { metadata: { workspaceId: 'w2' } } },
        },
      },
    });

    const event = await provider.parseWebhook(Buffer.from('body'), 'sig');
    expect(event).toMatchObject({
      type: 'SUBSCRIPTION_UPDATED',
      status: 'PAST_DUE',
      tier: null,
      workspaceId: 'w2',
    });
  });

  it('unrecognised event type → IGNORED', async () => {
    const provider = new StripeProvider(makeConfig());
    stubConstructEvent(provider, {
      type: 'payment_intent.created',
      data: { object: {} },
    });

    const event = await provider.parseWebhook(Buffer.from('body'), 'sig');
    expect(event.type).toBe('IGNORED');
  });

  it('throws ServiceUnavailableException when constructEvent throws', async () => {
    const provider = new StripeProvider(makeConfig());
    const privateProvider = provider as unknown as {
      stripe: { webhooks: { constructEvent: jest.Mock } };
    };
    privateProvider.stripe.webhooks.constructEvent = jest
      .fn()
      .mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature');
      });

    await expect(provider.parseWebhook(Buffer.from('body'), 'bad_sig')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

const planConfig = { get: jest.fn(() => '') } as unknown as ConfigService<Env, true>;

function withStripe(stripe: Record<string, unknown>) {
  const provider = new StripeProvider(planConfig);
  // Inject a mock Stripe client (the real one is created in the constructor).
  (provider as unknown as { stripe: unknown }).stripe = stripe;
  return provider;
}

describe('StripeProvider.changePlanImmediately', () => {
  it('updates the line item with new price_data, proration, and tier metadata', async () => {
    const update = jest.fn().mockResolvedValue({});
    const retrieve = jest.fn().mockResolvedValue({
      id: 'sub_1',
      items: { data: [{ id: 'si_1', price: { id: 'price_old' } }] },
      metadata: { workspaceId: 'w1', tier: 'PRO' },
    });
    const provider = withStripe({ subscriptions: { retrieve, update } });

    await provider.changePlanImmediately('sub_1', 'PREMIUM');

    expect(update).toHaveBeenCalledTimes(1);
    const [subId, params] = update.mock.calls[0];
    expect(subId).toBe('sub_1');
    expect(params.proration_behavior).toBe('create_prorations');
    expect(params.metadata).toEqual({ workspaceId: 'w1', tier: 'PREMIUM' });
    expect(params.items[0].id).toBe('si_1');
    expect(params.items[0].price_data.unit_amount).toBe(999); // PREMIUM
  });
});

describe('StripeProvider.scheduleDowngrade', () => {
  it('creates a schedule from the sub and appends a period-end phase for the new tier', async () => {
    const retrieve = jest.fn().mockResolvedValue({
      id: 'sub_1',
      schedule: null,
      items: { data: [{ id: 'si_1', price: { id: 'price_premium' }, quantity: 1 }] },
      metadata: { workspaceId: 'w1', tier: 'PREMIUM' },
    });
    const schedCreate = jest.fn().mockResolvedValue({
      id: 'sched_1',
      phases: [{ items: [{ price: 'price_premium', quantity: 1 }], start_date: 1000 }],
    });
    const schedUpdate = jest.fn().mockResolvedValue({});
    const provider = withStripe({
      subscriptions: { retrieve },
      subscriptionSchedules: { create: schedCreate, update: schedUpdate },
    });

    const effectiveAt = new Date('2026-07-07T00:00:00.000Z');
    const result = await provider.scheduleDowngrade('sub_1', 'PRO', effectiveAt);

    expect(result).toEqual({ scheduleId: 'sched_1' });
    expect(schedCreate).toHaveBeenCalledWith({ from_subscription: 'sub_1' });
    const [, params] = schedUpdate.mock.calls[0];
    expect(params.end_behavior).toBe('release');
    expect(params.phases).toHaveLength(2);
    expect(params.phases[0].end_date).toBe(Math.floor(effectiveAt.getTime() / 1000));
    expect(params.phases[1].items[0].price_data.unit_amount).toBe(499); // PRO
    expect(params.phases[1].metadata).toEqual({ workspaceId: 'w1', tier: 'PRO' });
  });
});

describe('StripeProvider.releaseScheduledChange', () => {
  it('releases the schedule', async () => {
    const release = jest.fn().mockResolvedValue({});
    const provider = withStripe({ subscriptionSchedules: { release } });
    await provider.releaseScheduledChange('sched_1');
    expect(release).toHaveBeenCalledWith('sched_1');
  });
});
