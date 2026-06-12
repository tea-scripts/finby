import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import type { UserPreferences } from '@finby/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { EmailService } from '../email/email.service';
import type { Env } from '../../config/env.schema';
import { parsePreferences } from '../auth/preferences.util';
import { localDayInfo } from './reminders.time';
import { dayOfYearUtc } from './reminders.copy';
import { reengagementCopy } from './reengagement.copy';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Days without any sign of life before a user counts as lapsed. */
const INACTIVE_AFTER_DAYS = 7;
/** Minimum days between two re-engagement nudges for the same user. */
const COOLDOWN_DAYS = 30;
/** Local hour (0-23) at which the nudge goes out — one hour before the daily
 *  reminder so the two never land back to back. */
const SEND_HOUR = 19;

interface LapsedUser {
  id: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  timezone: string;
  preferences: unknown;
}

/** Win-back nudges for users who haven't opened the app in a while: a push if
 *  any device is subscribed, otherwise a "we miss you" email. Capped to one
 *  nudge per COOLDOWN_DAYS, gated on the dailyReminders preference. */
@Injectable()
export class ReengagementService {
  private readonly logger = new Logger(ReengagementService.name);

  // push is optional for the same reason as in RemindersService: unit tests and
  // unconfigured-push deploys. Without it, every lapsed user takes the email path.
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService<Env, true>,
    @Optional() private readonly push?: PushService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runHourlySweep(): Promise<void> {
    try {
      await this.sendReengagementNudges();
    } catch (err) {
      this.logger.error(`Re-engagement sweep failed: ${this.describe(err)}`);
    }
  }

  /** Nudge every lapsed user for whom it is now ~7pm local. "Active" means a
   *  login / token refresh (refresh-token row) or a logged transaction within
   *  the window — NOT user.updatedAt, which our own reminder stamps bump daily. */
  async sendReengagementNudges(now = new Date()): Promise<void> {
    const cutoff = new Date(now.getTime() - INACTIVE_AFTER_DAYS * DAY_MS);

    const [recentTokens, recentTxns] = await Promise.all([
      this.prisma.refreshToken.findMany({
        where: { createdAt: { gte: cutoff } },
        distinct: ['userId'],
        select: { userId: true },
      }),
      this.prisma.transaction.findMany({
        where: { createdAt: { gte: cutoff } },
        distinct: ['loggedByUserId'],
        select: { loggedByUserId: true },
      }),
    ]);
    const activeIds = [
      ...new Set([...recentTokens.map((t) => t.userId), ...recentTxns.map((t) => t.loggedByUserId)]),
    ];

    // notIn over the active set is fine at current scale; revisit with a proper
    // lastSeenAt column if the user base outgrows it.
    const lapsed = await this.prisma.user.findMany({
      where: {
        createdAt: { lt: cutoff }, // brand-new signups aren't "lapsed"
        ...(activeIds.length ? { id: { notIn: activeIds } } : {}),
      },
      select: {
        id: true,
        displayName: true,
        email: true,
        emailVerified: true,
        timezone: true,
        preferences: true,
      },
    });
    if (lapsed.length === 0) return;

    const subscribed = await this.prisma.pushSubscription.findMany({
      distinct: ['userId'],
      select: { userId: true },
    });
    const pushUserIds = new Set(subscribed.map((s) => s.userId));
    const openUrl = `${this.config.get('WEB_URL', { infer: true })}/chat`;

    for (const user of lapsed) {
      try {
        await this.maybeNudge(user, pushUserIds.has(user.id), openUrl, now);
      } catch (err) {
        this.logger.warn(`Re-engagement nudge failed for user ${user.id}: ${this.describe(err)}`);
      }
    }
  }

  private async maybeNudge(
    user: LapsedUser,
    hasPushSubscription: boolean,
    openUrl: string,
    now: Date,
  ): Promise<void> {
    const prefs = parsePreferences(user.preferences);
    // The dailyReminders toggle is the user's master "nudge me" switch — it
    // covers this channel too, so opted-out users get neither push nor email.
    if (prefs.dailyReminders === false) return;

    let day: ReturnType<typeof localDayInfo>;
    try {
      day = localDayInfo(now, user.timezone || 'UTC');
    } catch {
      day = localDayInfo(now, 'UTC'); // bad tz string -> treat as UTC
    }
    if (day.hour !== SEND_HOUR) return;

    if (prefs.lastReengagedAt) {
      const last = Date.parse(prefs.lastReengagedAt);
      if (Number.isFinite(last) && now.getTime() - last < COOLDOWN_DAYS * DAY_MS) return;
    }

    const name = user.displayName?.trim() || 'there';

    if (hasPushSubscription && this.push) {
      const { title, body } = reengagementCopy(name, dayOfYearUtc(now));
      await this.push.sendToUserDevices(user.id, { title, body, url: '/chat' });
      // Stamping lastDailyReminderAt too keeps the 8pm daily nudge from landing
      // an hour after this one on the same evening.
      await this.stamp(user.id, user.preferences, {
        lastReengagedAt: now.toISOString(),
        lastDailyReminderAt: day.date,
      });
      return;
    }

    if (!user.emailVerified) return;
    await this.email.sendReengagement(user.email, name, openUrl);
    await this.stamp(user.id, user.preferences, { lastReengagedAt: now.toISOString() });
  }

  /** Merge the nudge stamps into preferences (same caveat as RemindersService:
   *  a concurrent profile update could clobber, collision odds negligible). */
  private async stamp(
    userId: string,
    current: unknown,
    patch: Partial<UserPreferences>,
  ): Promise<void> {
    const merged = { ...parsePreferences(current), ...patch };
    await this.prisma.user.update({
      where: { id: userId },
      data: { preferences: merged as unknown as Prisma.InputJsonValue },
    });
  }

  private describe(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
