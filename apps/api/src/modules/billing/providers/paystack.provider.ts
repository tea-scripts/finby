import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { TIER_PRICING, type SubscriptionTier } from '@finby/shared';
import type { Env } from '../../../config/env.schema';
import type {
  BillingProvider,
  BillingWebhookEvent,
  CheckoutParams,
  CheckoutResult,
} from '../billing.types';

const PAYSTACK_API = 'https://api.paystack.co';

/**
 * Functional Paystack adapter (init transaction + HMAC-SHA512 webhook verify).
 * Built to satisfy the BillingProvider port; not live-tested in this pass
 * (Stripe is the verified path). Paystack signs webhooks with the secret key.
 */
@Injectable()
export class PaystackProvider implements BillingProvider {
  readonly name = 'PAYSTACK' as const;
  private readonly logger = new Logger(PaystackProvider.name);
  private readonly secretKey: string;

  constructor(config: ConfigService<Env, true>) {
    this.secretKey = config.get('PAYSTACK_SECRET_KEY', { infer: true }) ?? '';
  }

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const price = TIER_PRICING[params.tier];
    let response: Response;
    try {
      response = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: params.customerEmail,
          amount: price.amountMinor,
          currency: price.currency,
          callback_url: params.successUrl,
          metadata: { workspaceId: params.workspaceId, tier: params.tier },
        }),
      });
    } catch {
      throw new ServiceUnavailableException('Paystack is unreachable.');
    }
    if (!response.ok) {
      throw new ServiceUnavailableException(`Paystack error (${response.status}).`);
    }
    const data = (await response.json()) as { data?: { authorization_url?: string } };
    const url = data.data?.authorization_url;
    if (!url) {
      throw new ServiceUnavailableException('Paystack did not return a checkout URL.');
    }
    return { url };
  }

  async parseWebhook(rawBody: Buffer | string, signature: string): Promise<BillingWebhookEvent> {
    const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
    const expected = createHmac('sha512', this.secretKey).update(body).digest('hex');
    const sigBuf = Buffer.from(signature ?? '', 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      this.logger.warn('Paystack webhook signature mismatch.');
      throw new ServiceUnavailableException('Invalid webhook signature.');
    }

    const event = JSON.parse(body.toString('utf8')) as {
      event?: string;
      data?: { customer?: { customer_code?: string }; metadata?: Record<string, string> };
    };

    if (event.event === 'charge.success') {
      const metadata = event.data?.metadata ?? {};
      const workspaceId = metadata.workspaceId ?? null;
      return {
        type: workspaceId ? 'SUBSCRIPTION_ACTIVE' : 'IGNORED',
        workspaceId,
        tier: (metadata.tier as SubscriptionTier | undefined) ?? null,
        status: 'ACTIVE',
        providerCustomerId: event.data?.customer?.customer_code ?? null,
        providerSubscriptionId: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
      };
    }

    return {
      type: 'IGNORED',
      workspaceId: null,
      tier: null,
      status: 'ACTIVE',
      providerCustomerId: null,
      providerSubscriptionId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
    };
  }

  async cancelAtPeriodEnd(_providerSubscriptionId: string, _cancel: boolean): Promise<void> {
    // Paystack subscription cancellation requires the subscription code + email token;
    // deferred until Paystack goes live. DB cancelAtPeriodEnd flag still applies.
  }
}
