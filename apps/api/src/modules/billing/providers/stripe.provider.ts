import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { TIER_PRICING, type SubscriptionTier } from '@finby/shared';
import type { Env } from '../../../config/env.schema';
import type {
  BillingProvider,
  BillingWebhookEvent,
  CheckoutParams,
  CheckoutResult,
  SubscriptionStatusP5,
} from '../billing.types';

// Minimal shapes for the Stripe objects we read — avoids depending on the
// SDK's namespace types (which don't resolve cleanly under moduleResolution: Node).
interface StripeMeta {
  workspaceId?: string;
  tier?: string;
}
interface StripeSessionLike {
  metadata?: StripeMeta | null;
  customer?: string | { id: string } | null;
  subscription?: string | { id: string } | null;
}
interface StripeSubLike {
  id: string;
  status: string;
  metadata?: StripeMeta | null;
  customer?: string | { id: string } | null;
  current_period_start?: number;
  current_period_end?: number;
}
interface StripeInvoiceLike {
  subscription_details?: { metadata?: StripeMeta | null } | null;
  subscription?: string | { id: string } | null;
  customer?: string | { id: string } | null;
  parent?: { subscription_details?: { metadata?: StripeMeta | null } | null } | null;
}

function mapStatus(status: string): SubscriptionStatusP5 {
  switch (status) {
    case 'active':
      return 'ACTIVE';
    case 'trialing':
      return 'TRIALING';
    case 'past_due':
    case 'unpaid':
      return 'PAST_DUE';
    case 'paused':
      return 'PAUSED';
    default:
      return 'CANCELED';
  }
}

function asId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

/** The ONLY file that imports the Stripe SDK. */
@Injectable()
export class StripeProvider implements BillingProvider {
  readonly name = 'STRIPE' as const;
  private readonly logger = new Logger(StripeProvider.name);
  private readonly stripe: InstanceType<typeof Stripe>;
  private readonly webhookSecret: string;

  constructor(config: ConfigService<Env, true>) {
    // Fall back to a placeholder so the app boots without billing configured;
    // real API calls then fail with a clear Stripe auth error until keys are set.
    const apiKey = config.get('STRIPE_SECRET_KEY', { infer: true }) ?? '';
    this.stripe = new Stripe(apiKey || 'sk_test_unconfigured');
    this.webhookSecret = config.get('STRIPE_WEBHOOK_SECRET', { infer: true }) ?? '';
  }

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const price = TIER_PRICING[params.tier];
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: params.customerEmail,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: price.currency.toLowerCase(),
            unit_amount: price.amountMinor,
            recurring: { interval: price.interval },
            product_data: { name: `Finby ${params.tier}` },
          },
        },
      ],
      metadata: { workspaceId: params.workspaceId, tier: params.tier },
      subscription_data: { metadata: { workspaceId: params.workspaceId, tier: params.tier } },
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    });

    if (!session.url) {
      throw new ServiceUnavailableException('Stripe did not return a checkout URL.');
    }
    return { url: session.url };
  }

  async parseWebhook(rawBody: Buffer | string, signature: string): Promise<BillingWebhookEvent> {
    const event = this.verify(rawBody, signature);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as unknown as StripeSessionLike;
      return this.build('SUBSCRIPTION_ACTIVE', 'ACTIVE', session.metadata, {
        customerId: asId(session.customer),
        subscriptionId: asId(session.subscription),
        periodStart: null,
        periodEnd: null,
      });
    }

    if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object as unknown as StripeSubLike;
      const status = mapStatus(sub.status);
      return this.build(
        status === 'CANCELED' ? 'SUBSCRIPTION_CANCELED' : 'SUBSCRIPTION_UPDATED',
        status,
        sub.metadata,
        {
          customerId: asId(sub.customer),
          subscriptionId: sub.id,
          periodStart: sub.current_period_start ? new Date(sub.current_period_start * 1000) : null,
          periodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
        },
      );
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as unknown as StripeSubLike;
      return this.build('SUBSCRIPTION_CANCELED', 'CANCELED', sub.metadata, {
        customerId: asId(sub.customer),
        subscriptionId: sub.id,
        periodStart: null,
        periodEnd: null,
      });
    }

    if (event.type === 'invoice.payment_failed' || event.type === 'invoice.payment_succeeded') {
      const inv = event.data.object as unknown as StripeInvoiceLike;
      const workspaceId =
        inv.subscription_details?.metadata?.workspaceId ??
        inv.parent?.subscription_details?.metadata?.workspaceId ??
        null;
      if (!workspaceId) {
        return this.ignored();
      }
      const status: SubscriptionStatusP5 =
        event.type === 'invoice.payment_failed' ? 'PAST_DUE' : 'ACTIVE';
      return {
        type: 'SUBSCRIPTION_UPDATED',
        workspaceId,
        tier: null,
        status,
        providerCustomerId: asId(inv.customer),
        providerSubscriptionId: asId(inv.subscription),
        currentPeriodStart: null,
        currentPeriodEnd: null,
      };
    }

    return this.ignored();
  }

  async cancelAtPeriodEnd(providerSubscriptionId: string, cancel: boolean): Promise<void> {
    await this.stripe.subscriptions.update(providerSubscriptionId, { cancel_at_period_end: cancel });
  }

  private verify(rawBody: Buffer | string, signature: string) {
    try {
      return this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch (error) {
      this.logger.warn(`Stripe webhook signature verification failed: ${this.describe(error)}`);
      throw new ServiceUnavailableException('Invalid webhook signature.');
    }
  }

  private build(
    type: BillingWebhookEvent['type'],
    status: SubscriptionStatusP5,
    metadata: StripeMeta | null | undefined,
    ids: {
      customerId: string | null;
      subscriptionId: string | null;
      periodStart: Date | null;
      periodEnd: Date | null;
    },
  ): BillingWebhookEvent {
    const workspaceId = metadata?.workspaceId ?? null;
    return {
      type: workspaceId ? type : 'IGNORED',
      workspaceId,
      tier: type === 'SUBSCRIPTION_CANCELED' ? 'FREE' : ((metadata?.tier as SubscriptionTier) ?? null),
      status,
      providerCustomerId: ids.customerId,
      providerSubscriptionId: ids.subscriptionId,
      currentPeriodStart: ids.periodStart,
      currentPeriodEnd: ids.periodEnd,
    };
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

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
