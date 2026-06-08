import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { Env } from '../../config/env.schema';
import { TIER_LIMITS, type SubscriptionTier } from '@finby/shared';
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

const TIER_RANK: Record<Exclude<SubscriptionTier, 'FREE'>, number> = {
  PRO: 1,
  PREMIUM: 2,
  FAMILY: 3,
};

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
        pendingTier: null,
        pendingTierEffectiveAt: null,
      };
    }
    return {
      tier: sub.tier as SubscriptionTier,
      status: sub.status as SubscriptionStatusP5,
      billingProvider: sub.billingProvider as BillingProviderName,
      currentPeriodEnd: sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      pendingTier: sub.pendingTier as SubscriptionTier | null,
      pendingTierEffectiveAt: sub.pendingTierEffectiveAt
        ? sub.pendingTierEffectiveAt.toISOString()
        : null,
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
      data: {
        cancelAtPeriodEnd: cancel,
        canceledAt: cancel ? new Date() : null,
        // Resuming auto-renew clears any pending expiry reminders.
        ...(cancel ? {} : { renewalReminder7SentAt: null, renewalReminder3SentAt: null }),
      },
    });
    return this.getSubscription(workspaceId);
  }

  async changePlan(
    workspaceId: string,
    targetTier: Exclude<SubscriptionTier, 'FREE'>,
  ): Promise<SubscriptionView> {
    const sub = await this.prisma.subscription.findUnique({ where: { workspaceId } });
    if (!sub || sub.billingProvider !== 'STRIPE' || !sub.stripeSubscriptionId) {
      throw new BadRequestException('No active Stripe subscription to change.');
    }
    const current = sub.tier as Exclude<SubscriptionTier, 'FREE'>;
    if (targetTier === current) {
      throw new BadRequestException('That is already your current plan.');
    }

    const provider = this.getProvider('STRIPE');
    const upgrading = TIER_RANK[targetTier] > TIER_RANK[current];

    if (upgrading) {
      // Cancel any pending downgrade, then switch immediately (prorated).
      if (sub.stripeScheduleId) {
        await provider.releaseScheduledChange(sub.stripeScheduleId);
      }
      await provider.changePlanImmediately(sub.stripeSubscriptionId, targetTier);
      await this.prisma.$transaction(async (txc) => {
        await txc.subscription.update({
          where: { workspaceId },
          data: {
            tier: targetTier,
            pendingTier: null,
            pendingTierEffectiveAt: null,
            stripeScheduleId: null,
          },
        });
        await txc.workspace.update({
          where: { id: workspaceId },
          data: { tier: targetTier, maxMembers: targetTier === 'FAMILY' ? 5 : 1 },
        });
      });
      return this.getSubscription(workspaceId);
    }

    // Downgrade: enforce seat limit, then schedule for period end.
    const seatLimit = TIER_LIMITS[targetTier].maxMembers;
    const memberCount = await this.prisma.workspaceMember.count({ where: { workspaceId } });
    if (memberCount > seatLimit) {
      throw new BadRequestException(
        `The ${targetTier} plan allows ${seatLimit} member${seatLimit === 1 ? '' : 's'}. Remove ${memberCount - seatLimit} before downgrading.`,
      );
    }

    // Release any existing schedule before creating a new one — Stripe rejects
    // subscriptionSchedules.create({ from_subscription }) if the subscription
    // already has a schedule attached.
    if (sub.stripeScheduleId) {
      await provider.releaseScheduledChange(sub.stripeScheduleId);
    }

    const { scheduleId } = await provider.scheduleDowngrade(
      sub.stripeSubscriptionId,
      targetTier,
      sub.currentPeriodEnd,
    );
    await this.prisma.subscription.update({
      where: { workspaceId },
      data: {
        pendingTier: targetTier,
        pendingTierEffectiveAt: sub.currentPeriodEnd,
        stripeScheduleId: scheduleId,
      },
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
      await this.downgradeToFree(workspaceId);
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
          // Renewal/upgrade re-arms the reminder cycle for the new period.
          renewalReminder7SentAt: null,
          renewalReminder3SentAt: null,
          // An applied downgrade/renewal resets any pending scheduled change.
          pendingTier: null,
          pendingTierEffectiveAt: null,
          stripeScheduleId: null,
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

  /** Downgrade a workspace to the free plan and mark its subscription canceled.
   *  Shared by the cancellation webhook and the expiry safety-net sweep. */
  async downgradeToFree(workspaceId: string): Promise<void> {
    await this.prisma.$transaction(async (txc) => {
      await txc.subscription.update({
        where: { workspaceId },
        data: { status: 'CANCELED', tier: 'FREE', canceledAt: new Date() },
      });
      await txc.workspace.update({
        where: { id: workspaceId },
        data: { tier: 'FREE', maxMembers: 1 },
      });
    });
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

  async createPortalSession(workspaceId: string): Promise<{ url: string }> {
    const sub = await this.prisma.subscription.findUnique({ where: { workspaceId } });
    if (!sub || sub.billingProvider !== 'STRIPE' || !sub.stripeCustomerId) {
      throw new BadRequestException('No Stripe billing to manage for this workspace.');
    }
    const provider = this.getProvider('STRIPE');
    if (!provider.createPortalSession) {
      throw new BadRequestException('Billing portal is not available.');
    }
    const returnUrl = `${this.config.get('WEB_URL', { infer: true })}/settings`;
    return provider.createPortalSession({ providerCustomerId: sub.stripeCustomerId, returnUrl });
  }

  getProvider(name: BillingProviderName): BillingProvider {
    if (name === 'STRIPE') return this.stripe;
    if (name === 'LEMONSQUEEZY') return this.lemonsqueezy;
    return this.paystack;
  }
}
