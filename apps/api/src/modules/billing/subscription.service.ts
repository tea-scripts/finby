import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { Env } from '../../config/env.schema';
import type { SubscriptionTier } from '@finby/shared';
import { LEMONSQUEEZY_PROVIDER, PAYSTACK_PROVIDER, STRIPE_PROVIDER } from './billing.constants';
import type {
  BillingProvider,
  BillingProviderName,
  BillingWebhookEvent,
  CheckoutResult,
  SubscriptionStatusP5,
  SubscriptionView,
} from './billing.types';

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    @Inject(STRIPE_PROVIDER) private readonly stripe: BillingProvider,
    @Inject(PAYSTACK_PROVIDER) private readonly paystack: BillingProvider,
    @Inject(LEMONSQUEEZY_PROVIDER) private readonly lemonsqueezy: BillingProvider,
  ) {}

  async getSubscription(workspaceId: string): Promise<SubscriptionView> {
    const sub = await this.prisma.subscription.findUnique({ where: { workspaceId } });
    if (!sub) {
      const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
      return {
        tier: (workspace?.tier ?? 'FREE') as SubscriptionTier,
        status: 'ACTIVE',
        billingProvider: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      };
    }
    return {
      tier: sub.tier as SubscriptionTier,
      status: sub.status as SubscriptionStatusP5,
      billingProvider: sub.billingProvider as BillingProviderName,
      currentPeriodEnd: sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    };
  }

  async createCheckout(
    workspaceId: string,
    customerEmail: string,
    tier: Exclude<SubscriptionTier, 'FREE'>,
    provider: BillingProviderName,
  ): Promise<CheckoutResult> {
    const webUrl = this.config.get('WEB_URL', { infer: true });
    return this.getProvider(provider).createCheckout({
      workspaceId,
      tier,
      customerEmail,
      successUrl: `${webUrl}/billing/success`,
      cancelUrl: `${webUrl}/billing/cancel`,
    });
  }

  async setCancelAtPeriodEnd(workspaceId: string, cancel: boolean): Promise<SubscriptionView> {
    const sub = await this.prisma.subscription.findUnique({ where: { workspaceId } });
    if (
      !sub ||
      (!sub.stripeSubscriptionId && !sub.paystackSubscriptionCode && !sub.lemonSqueezySubscriptionId)
    ) {
      throw new BadRequestException('No active paid subscription to modify.');
    }

    const providerName = sub.billingProvider as BillingProviderName;
    const providerSubId =
      sub.stripeSubscriptionId ?? sub.paystackSubscriptionCode ?? sub.lemonSqueezySubscriptionId;
    if (providerSubId) {
      await this.getProvider(providerName).cancelAtPeriodEnd(providerSubId, cancel);
    }

    await this.prisma.subscription.update({
      where: { workspaceId },
      data: { cancelAtPeriodEnd: cancel, canceledAt: cancel ? new Date() : null },
    });
    return this.getSubscription(workspaceId);
  }

  async applyWebhookEvent(provider: BillingProviderName, event: BillingWebhookEvent): Promise<void> {
    if (event.type === 'IGNORED' || !event.workspaceId) {
      return;
    }

    if (event.eventId) {
      const seen = await this.prisma.processedWebhookEvent.findUnique({
        where: { provider_eventId: { provider, eventId: event.eventId } },
      });
      if (seen) return; // already processed — idempotent no-op
    }

    const workspaceId = event.workspaceId;

    if (event.type === 'SUBSCRIPTION_CANCELED') {
      await this.prisma.$transaction(async (txc) => {
        await txc.subscription.update({
          where: { workspaceId },
          data: { status: 'CANCELED', tier: 'FREE', canceledAt: new Date() },
        });
        await txc.workspace.update({ where: { id: workspaceId }, data: { tier: 'FREE', maxMembers: 1 } });
      });
      await this.markProcessed(provider, event.eventId);
      return;
    }

    // Status-only update (e.g. invoice.payment_failed/succeeded) — never change tier.
    if (event.type === 'SUBSCRIPTION_UPDATED' && event.tier === null) {
      const existing = await this.prisma.subscription.findUnique({ where: { workspaceId } });
      if (existing) {
        await this.prisma.subscription.update({
          where: { workspaceId },
          data: { status: event.status },
        });
        await this.markProcessed(provider, event.eventId);
      }
      return;
    }

    const tier = (event.tier ?? 'PRO') as Exclude<SubscriptionTier, 'FREE'>;
    const periodStart = event.currentPeriodStart ?? new Date();
    const periodEnd = event.currentPeriodEnd ?? new Date(Date.now() + MONTH_MS);
    const ids =
      provider === 'STRIPE'
        ? { stripeCustomerId: event.providerCustomerId, stripeSubscriptionId: event.providerSubscriptionId }
        : provider === 'LEMONSQUEEZY'
          ? {
              lemonSqueezyCustomerId: event.providerCustomerId,
              lemonSqueezySubscriptionId: event.providerSubscriptionId,
            }
          : { paystackCustomerCode: event.providerCustomerId };

    await this.prisma.$transaction(async (txc) => {
      await txc.subscription.upsert({
        where: { workspaceId },
        update: {
          tier,
          status: event.status,
          billingProvider: provider,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          ...ids,
        },
        create: {
          workspaceId,
          tier,
          status: event.status,
          billingProvider: provider,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          ...ids,
        },
      });
      await txc.workspace.update({
        where: { id: workspaceId },
        data: { tier, maxMembers: tier === 'FAMILY' ? 5 : 1 },
      });
    });
    await this.markProcessed(provider, event.eventId);
  }

  /** Record a processed webhook event so re-delivery is a no-op. Swallows the
   *  unique-violation race (event already recorded); logs anything else. */
  private async markProcessed(provider: BillingProviderName, eventId: string | null): Promise<void> {
    if (!eventId) return;
    try {
      await this.prisma.processedWebhookEvent.create({ data: { provider, eventId } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return; // already recorded (race)
      this.logger.warn(`Failed to record processed webhook event ${eventId}: ${String(err)}`);
    }
  }

  getProvider(name: BillingProviderName): BillingProvider {
    if (name === 'STRIPE') return this.stripe;
    if (name === 'LEMONSQUEEZY') return this.lemonsqueezy;
    return this.paystack;
  }
}
