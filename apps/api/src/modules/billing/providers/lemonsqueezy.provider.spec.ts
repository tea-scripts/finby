import { createHmac } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.schema';
import { LemonSqueezyProvider } from './lemonsqueezy.provider';

const SECRET = 'whsec_test';

function makeConfig(): ConfigService<Env, true> {
  const values: Record<string, string> = {
    LEMONSQUEEZY_API_KEY: 'ls_test',
    LEMONSQUEEZY_STORE_ID: 'store_1',
    LEMONSQUEEZY_WEBHOOK_SECRET: SECRET,
    LEMONSQUEEZY_VARIANT_PRO: 'var_pro',
    LEMONSQUEEZY_VARIANT_PREMIUM: 'var_prem',
    LEMONSQUEEZY_VARIANT_FAMILY: 'var_fam',
  };
  return { get: (k: string) => values[k] } as unknown as ConfigService<Env, true>;
}

function sign(body: string): string {
  return createHmac('sha256', SECRET).update(Buffer.from(body)).digest('hex');
}

describe('LemonSqueezyProvider.parseWebhook', () => {
  const provider = new LemonSqueezyProvider(makeConfig());

  it('maps an active subscription event with the workspace + tier from custom data', async () => {
    const body = JSON.stringify({
      meta: { event_name: 'subscription_created', custom_data: { workspace_id: 'w1', tier: 'PRO' } },
      data: {
        id: 'sub_123',
        attributes: { status: 'active', variant_id: 'var_pro', customer_id: 99, renews_at: '2026-07-01T00:00:00Z' },
      },
    });
    const event = await provider.parseWebhook(body, sign(body));
    expect(event).toMatchObject({
      type: 'SUBSCRIPTION_ACTIVE',
      workspaceId: 'w1',
      tier: 'PRO',
      status: 'ACTIVE',
      providerSubscriptionId: 'sub_123',
      providerCustomerId: '99',
    });
    expect(event.currentPeriodEnd?.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });

  it('downgrades on an expired subscription', async () => {
    const body = JSON.stringify({
      meta: { event_name: 'subscription_expired', custom_data: { workspace_id: 'w1', tier: 'PRO' } },
      data: { id: 'sub_123', attributes: { status: 'expired', variant_id: 'var_pro' } },
    });
    const event = await provider.parseWebhook(body, sign(body));
    expect(event.type).toBe('SUBSCRIPTION_CANCELED');
    expect(event.workspaceId).toBe('w1');
  });

  it('rejects a bad signature', async () => {
    const body = JSON.stringify({ meta: { event_name: 'subscription_created', custom_data: {} } });
    await expect(provider.parseWebhook(body, 'deadbeef')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('ignores events without a workspace', async () => {
    const body = JSON.stringify({
      meta: { event_name: 'subscription_created', custom_data: {} },
      data: { id: 's', attributes: { status: 'active' } },
    });
    const event = await provider.parseWebhook(body, sign(body));
    expect(event.type).toBe('IGNORED');
  });
});

describe('LemonSqueezyProvider.createCheckout', () => {
  const provider = new LemonSqueezyProvider(makeConfig());
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('posts a checkout with the tier variant + custom data and returns the URL', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ data: { attributes: { url: 'https://pay.ls/abc' } } }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await provider.createCheckout({
      workspaceId: 'w1',
      tier: 'PRO',
      customerEmail: 'a@b.com',
      successUrl: 'https://chat.finby.app/billing/success',
      cancelUrl: 'https://chat.finby.app/billing/cancel',
    });

    expect(result.url).toBe('https://pay.ls/abc');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/checkouts');
    const sent = JSON.parse(init.body as string);
    expect(sent.data.relationships.variant.data.id).toBe('var_pro');
    expect(sent.data.attributes.checkout_data.custom).toMatchObject({ workspace_id: 'w1', tier: 'PRO' });
  });
});
