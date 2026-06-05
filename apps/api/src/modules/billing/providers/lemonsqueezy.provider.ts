import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SubscriptionTier } from '@finby/shared';
import type { Env } from '../../../config/env.schema';
import type {
  BillingProvider,
  BillingWebhookEvent,
  CheckoutParams,
  CheckoutResult,
  SubscriptionStatusP5,
} from '../billing.types';

const LS_API = 'https://api.lemonsqueezy.com/v1';
const JSON_API = 'application/vnd.api+json';

type PaidTier = Exclude<SubscriptionTier, 'FREE'>;

/** Shape of the bits of a Lemon Squeezy subscription webhook we consume. */
interface LsWebhook {
  meta?: { event_name?: string; custom_data?: Record<string, string> };
  data?: {
    id?: string;
    attributes?: {
      status?: string;
      variant_id?: number | string;
      customer_id?: number | string;
      renews_at?: string | null;
      ends_at?: string | null;
    };
  };
}

/**
 * Lemon Squeezy (Merchant of Record) adapter. LS is the seller of record — it
 * accepts cards globally and remits tax — so it works from countries where
 * Stripe onboarding isn't available. Checkout via the LS API; webhooks are
 * signed with HMAC-SHA256 over the raw body (X-Signature header).
 *
 * Not live-tested in this pass (needs a configured store + product variants).
 */
@Injectable()
export class LemonSqueezyProvider implements BillingProvider {
  readonly name = 'LEMONSQUEEZY' as const;
  private readonly logger = new Logger(LemonSqueezyProvider.name);
  private readonly apiKey: string;
  private readonly storeId: string;
  private readonly webhookSecret: string;
  private readonly variantByTier: Record<PaidTier, string | undefined>;

  constructor(config: ConfigService<Env, true>) {
    this.apiKey = config.get('LEMONSQUEEZY_API_KEY', { infer: true }) ?? '';
    this.storeId = config.get('LEMONSQUEEZY_STORE_ID', { infer: true }) ?? '';
    this.webhookSecret = config.get('LEMONSQUEEZY_WEBHOOK_SECRET', { infer: true }) ?? '';
    this.variantByTier = {
      PRO: config.get('LEMONSQUEEZY_VARIANT_PRO', { infer: true }),
      PREMIUM: config.get('LEMONSQUEEZY_VARIANT_PREMIUM', { infer: true }),
      FAMILY: config.get('LEMONSQUEEZY_VARIANT_FAMILY', { infer: true }),
    };
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}`, Accept: JSON_API, 'Content-Type': JSON_API };
  }

  private variantId(tier: PaidTier): string {
    const id = this.variantByTier[tier];
    if (!id) {
      throw new ServiceUnavailableException(`Lemon Squeezy variant not configured for ${tier}.`);
    }
    return id;
  }

  private tierForVariant(variantId: number | string | undefined): SubscriptionTier | null {
    if (variantId == null) return null;
    const id = String(variantId);
    const entry = (Object.entries(this.variantByTier) as Array<[PaidTier, string | undefined]>).find(
      ([, v]) => v === id,
    );
    return entry ? entry[0] : null;
  }

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const variantId = this.variantId(params.tier);
    let response: Response;
    try {
      response = await fetch(`${LS_API}/checkouts`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          data: {
            type: 'checkouts',
            attributes: {
              checkout_data: {
                email: params.customerEmail,
                custom: { workspace_id: params.workspaceId, tier: params.tier },
              },
              product_options: { redirect_url: params.successUrl },
            },
            relationships: {
              store: { data: { type: 'stores', id: this.storeId } },
              variant: { data: { type: 'variants', id: variantId } },
            },
          },
        }),
      });
    } catch {
      throw new ServiceUnavailableException('Lemon Squeezy is unreachable.');
    }
    if (!response.ok) {
      throw new ServiceUnavailableException(`Lemon Squeezy error (${response.status}).`);
    }
    const json = (await response.json()) as { data?: { attributes?: { url?: string } } };
    const url = json.data?.attributes?.url;
    if (!url) {
      throw new ServiceUnavailableException('Lemon Squeezy did not return a checkout URL.');
    }
    return { url };
  }

  async parseWebhook(rawBody: Buffer | string, signature: string): Promise<BillingWebhookEvent> {
    const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
    const expected = createHmac('sha256', this.webhookSecret).update(body).digest('hex');
    const sigBuf = Buffer.from(signature ?? '', 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      this.logger.warn('Lemon Squeezy webhook signature mismatch.');
      throw new ServiceUnavailableException('Invalid webhook signature.');
    }

    const payload = JSON.parse(body.toString('utf8')) as LsWebhook;
    const eventName = payload.meta?.event_name ?? '';
    const custom = payload.meta?.custom_data ?? {};
    const attrs = payload.data?.attributes ?? {};
    const workspaceId = custom.workspace_id ?? null;
    const subscriptionId = payload.data?.id ?? null;
    const customerId = attrs.customer_id != null ? String(attrs.customer_id) : null;
    const periodEnd = attrs.renews_at
      ? new Date(attrs.renews_at)
      : attrs.ends_at
        ? new Date(attrs.ends_at)
        : null;

    if (!eventName.startsWith('subscription_') || !workspaceId) {
      return this.ignored();
    }

    // Subscription truly ended → downgrade to FREE.
    if (eventName === 'subscription_expired' || attrs.status === 'expired' || attrs.status === 'unpaid') {
      return {
        type: 'SUBSCRIPTION_CANCELED',
        workspaceId,
        tier: null,
        status: 'CANCELED',
        providerCustomerId: customerId,
        providerSubscriptionId: subscriptionId,
        currentPeriodStart: null,
        currentPeriodEnd: periodEnd,
      };
    }

    // Active (incl. "cancelled" — LS keeps access until ends_at; we keep the tier
    // and surface CANCELED status so the UI can show "cancels on <date>").
    const status: SubscriptionStatusP5 =
      attrs.status === 'on_trial'
        ? 'TRIALING'
        : attrs.status === 'past_due'
          ? 'PAST_DUE'
          : attrs.status === 'paused'
            ? 'PAUSED'
            : attrs.status === 'cancelled'
              ? 'CANCELED'
              : 'ACTIVE';

    return {
      type: 'SUBSCRIPTION_ACTIVE',
      workspaceId,
      tier: (custom.tier as SubscriptionTier | undefined) ?? this.tierForVariant(attrs.variant_id),
      status,
      providerCustomerId: customerId,
      providerSubscriptionId: subscriptionId,
      currentPeriodStart: null,
      currentPeriodEnd: periodEnd,
    };
  }

  async cancelAtPeriodEnd(providerSubscriptionId: string, cancel: boolean): Promise<void> {
    const url = `${LS_API}/subscriptions/${providerSubscriptionId}`;
    let response: Response;
    try {
      response = cancel
        ? await fetch(url, { method: 'DELETE', headers: this.headers() })
        : await fetch(url, {
            method: 'PATCH',
            headers: this.headers(),
            body: JSON.stringify({
              data: { type: 'subscriptions', id: providerSubscriptionId, attributes: { cancelled: false } },
            }),
          });
    } catch {
      throw new ServiceUnavailableException('Lemon Squeezy is unreachable.');
    }
    if (!response.ok) {
      throw new ServiceUnavailableException(`Lemon Squeezy error (${response.status}).`);
    }
  }

  private ignored(): BillingWebhookEvent {
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
}
