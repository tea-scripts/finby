import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import type { Env } from '../../config/env.schema';
import { EmailService } from '../email/email.service';
import { SubscriptionService } from './subscription.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Daily billing maintenance:
 *  1. Email the workspace owner 7 days and 3 days before a non-renewing or
 *     past-due plan lapses.
 *  2. Safety-net sweep — downgrade any paid plan whose period has clearly ended
 *     (with a 1-day grace) in case the provider's cancellation webhook was missed.
 *
 * Auto-renewing ACTIVE plans are intentionally left alone — they renew, and a
 * slightly-late renewal webhook must not trigger a reminder or a downgrade.
 */
@Injectable()
export class SubscriptionRemindersService {
  private readonly logger = new Logger(SubscriptionRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly subscriptions: SubscriptionService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async runDailyJob(): Promise<void> {
    try {
      await this.sendExpiryReminders();
    } catch (err) {
      this.logger.error(`Expiry reminder pass failed: ${this.describe(err)}`);
    }
    try {
      await this.sweepExpired();
    } catch (err) {
      this.logger.error(`Expiry sweep failed: ${this.describe(err)}`);
    }
  }

  /** Send the 7-day / 3-day "your plan ends soon" emails for non-renewing or
   *  past-due subscriptions. Idempotent per period via the reminder timestamps. */
  async sendExpiryReminders(now = new Date()): Promise<void> {
    const in7d = new Date(now.getTime() + 7 * DAY_MS);
    const candidates = await this.prisma.subscription.findMany({
      where: {
        tier: { not: 'FREE' },
        currentPeriodEnd: { gt: now, lte: in7d },
        OR: [{ cancelAtPeriodEnd: true, status: { not: 'CANCELED' } }, { status: 'PAST_DUE' }],
      },
    });

    const in3d = new Date(now.getTime() + 3 * DAY_MS);
    const manageUrl = `${this.config.get('WEB_URL', { infer: true })}/settings`;

    for (const sub of candidates) {
      const within3 = sub.currentPeriodEnd <= in3d;
      const stage: 7 | 3 = within3 ? 3 : 7;
      const alreadySent = within3 ? sub.renewalReminder3SentAt : sub.renewalReminder7SentAt;
      if (alreadySent) continue;

      try {
        const owner = await this.findOwner(sub.workspaceId);
        if (!owner) {
          this.logger.warn(`No owner email for workspace ${sub.workspaceId}; skipping reminder.`);
          continue;
        }
        const daysLeft = Math.max(
          1,
          Math.ceil((sub.currentPeriodEnd.getTime() - now.getTime()) / DAY_MS),
        );
        const endLabel = sub.currentPeriodEnd.toISOString().slice(0, 10);
        const reason = sub.status === 'PAST_DUE' ? 'PAST_DUE' : 'CANCELING';

        await this.email.sendRenewalReminder(
          owner.email,
          owner.displayName,
          daysLeft,
          endLabel,
          manageUrl,
          reason,
        );
        await this.prisma.subscription.update({
          where: { id: sub.id },
          data:
            stage === 3
              ? { renewalReminder3SentAt: now }
              : { renewalReminder7SentAt: now },
        });
        this.logger.log(`Sent ${stage}-day expiry reminder for workspace ${sub.workspaceId}.`);
      } catch (err) {
        this.logger.error(
          `Failed reminder for workspace ${sub.workspaceId}: ${this.describe(err)}`,
        );
      }
    }
  }

  /** Downgrade paid plans whose period ended (with a 1-day grace) but that were
   *  never downgraded via webhook. Limited to non-renewing / past-due plans. */
  async sweepExpired(now = new Date()): Promise<void> {
    const graceCutoff = new Date(now.getTime() - DAY_MS);
    const expired = await this.prisma.subscription.findMany({
      where: {
        tier: { not: 'FREE' },
        status: { not: 'CANCELED' },
        currentPeriodEnd: { lt: graceCutoff },
        OR: [{ cancelAtPeriodEnd: true }, { status: 'PAST_DUE' }],
      },
      select: { workspaceId: true },
    });

    for (const sub of expired) {
      try {
        await this.subscriptions.downgradeToFree(sub.workspaceId);
        this.logger.log(`Swept expired subscription to free for workspace ${sub.workspaceId}.`);
      } catch (err) {
        this.logger.error(
          `Failed to downgrade expired workspace ${sub.workspaceId}: ${this.describe(err)}`,
        );
      }
    }
  }

  private async findOwner(
    workspaceId: string,
  ): Promise<{ email: string; displayName: string } | null> {
    const member = await this.prisma.workspaceMember.findFirst({
      where: { workspaceId, role: 'OWNER' },
      orderBy: { joinedAt: 'asc' },
      include: { user: { select: { email: true, displayName: true } } },
    });
    return member?.user ?? null;
  }

  private describe(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
