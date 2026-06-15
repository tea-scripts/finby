import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import type { UserPreferences } from '@finby/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import type { Env } from '../../config/env.schema';
import { parsePreferences } from '../auth/preferences.util';
import { localDayInfo } from './reminders.time';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Only users this new get the first-week reminder; after this the existing
 *  re-engagement sweep (which excludes new signups) owns them. */
const EARLY_WINDOW_DAYS = 7;
/** Minimum days between two early reminders for one user (every other day). */
const MIN_GAP_DAYS = 2;
/** Local hour (0-23) at which the email goes out (~8pm). */
const SEND_HOUR = 20;

interface EarlyUser {
  id: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  timezone: string;
  currentStreak: number;
  preferences: unknown;
}

/** First-week email nudges for users who haven't enabled push and aren't yet
 *  logging daily. Email-only (push users are handled by the daily push nudge),
 *  capped to one every MIN_GAP_DAYS, gated on the dailyReminders preference. */
@Injectable()
export class EarlyReminderService {
  private readonly logger = new Logger(EarlyReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runHourlySweep(): Promise<void> {
    try {
      await this.sendEarlyReminders();
    } catch (err) {
      this.logger.error(`Early reminder sweep failed: ${this.describe(err)}`);
    }
  }

  /** Nudge every eligible new user for whom it is now ~8pm local. */
  async sendEarlyReminders(now = new Date()): Promise<void> {
    const windowStart = new Date(now.getTime() - EARLY_WINDOW_DAYS * DAY_MS);

    const candidates: EarlyUser[] = await this.prisma.user.findMany({
      where: { createdAt: { gte: windowStart }, emailVerified: true },
      select: {
        id: true,
        displayName: true,
        email: true,
        emailVerified: true,
        timezone: true,
        currentStreak: true,
        preferences: true,
      },
    });
    if (candidates.length === 0) return;

    const subscribed = await this.prisma.pushSubscription.findMany({
      where: { userId: { in: candidates.map((u) => u.id) } },
      distinct: ['userId'],
      select: { userId: true },
    });
    const pushUserIds = new Set(subscribed.map((s) => s.userId));
    const openUrl = `${this.config.get('WEB_URL', { infer: true })}/chat`;

    for (const user of candidates) {
      if (pushUserIds.has(user.id)) continue; // push users get the daily push nudge
      try {
        await this.maybeRemind(user, openUrl, now);
      } catch (err) {
        this.logger.warn(`Early reminder failed for user ${user.id}: ${this.describe(err)}`);
      }
    }
  }

  private async maybeRemind(user: EarlyUser, openUrl: string, now: Date): Promise<void> {
    if (!user.emailVerified) return;
    const prefs = parsePreferences(user.preferences);
    if (prefs.dailyReminders === false) return;

    let day: ReturnType<typeof localDayInfo>;
    try {
      day = localDayInfo(now, user.timezone || 'UTC');
    } catch {
      day = localDayInfo(now, 'UTC');
    }
    if (day.hour !== SEND_HOUR) return;

    if (prefs.lastEarlyReminderAt) {
      const last = Date.parse(prefs.lastEarlyReminderAt);
      if (Number.isFinite(last) && now.getTime() - last < MIN_GAP_DAYS * DAY_MS) return;
    }

    // Already forming the habit today -> stay silent.
    const loggedToday = await this.prisma.transaction.findFirst({
      where: { loggedByUserId: user.id, createdAt: { gte: new Date(day.startOfDayMs) } },
      select: { id: true },
    });
    if (loggedToday) return;

    const name = user.displayName?.trim() || 'there';
    await this.email.sendEarlyReminder(user.email, name, user.currentStreak, openUrl);
    await this.stamp(user.id, user.preferences, now.toISOString());
  }

  /** Merge the early-reminder stamp into preferences (same negligible-collision
   *  caveat as RemindersService/ReengagementService). */
  private async stamp(userId: string, current: unknown, iso: string): Promise<void> {
    const patch: Partial<UserPreferences> = { lastEarlyReminderAt: iso };
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
