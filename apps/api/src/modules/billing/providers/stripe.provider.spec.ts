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
