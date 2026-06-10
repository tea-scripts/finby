import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { parsePreferences } from '../auth/preferences.util';
import { localDayInfo } from './reminders.time';
import { dayOfYearUtc, reminderCopy } from './reminders.copy';

/** Local hour (0-23) at which the daily nudge fires. */
const REMINDER_HOUR = 20; // ~8pm local

interface ReminderUser {
  id: string;
  displayName: string;
  timezone: string;
  preferences: unknown;
}

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  // push is optional so unit tests can construct the service with just prisma,
  // and so the feature cleanly no-ops when push isn't wired/configured.
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly push?: PushService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runHourlyReminderSweep(): Promise<void> {
    try {
      await this.sendDailyReminders();
    } catch (err) {
      this.logger.error(`Daily reminder sweep failed: ${this.describe(err)}`);
    }
  }

  /** Nudge every push-enabled user for whom it is now ~8pm local, who has
   *  reminders on, hasn't been nudged today, and hasn't logged a transaction
   *  since their local midnight. One push per user across all devices. */
  async sendDailyReminders(now = new Date()): Promise<void> {
    if (!this.push) return;

    const subscribed = await this.prisma.pushSubscription.findMany({
      distinct: ['userId'],
      select: { userId: true },
    });
    if (subscribed.length === 0) return;

    const users = await this.prisma.user.findMany({
      where: { id: { in: subscribed.map((s) => s.userId) } },
      select: { id: true, displayName: true, timezone: true, preferences: true },
    });

    const dayIndex = dayOfYearUtc(now);
    for (const user of users) {
      try {
        await this.maybeRemind(user, now, dayIndex);
      } catch (err) {
        this.logger.warn(`Reminder check failed for user ${user.id}: ${this.describe(err)}`);
      }
    }
  }

  private async maybeRemind(user: ReminderUser, now: Date, dayIndex: number): Promise<void> {
    const prefs = parsePreferences(user.preferences);
    if (prefs.dailyReminders === false) return;

    let day: ReturnType<typeof localDayInfo>;
    try {
      day = localDayInfo(now, user.timezone || 'UTC');
    } catch {
      day = localDayInfo(now, 'UTC'); // bad tz string -> treat as UTC
    }
    if (day.hour !== REMINDER_HOUR) return;
    if (prefs.lastDailyReminderAt === day.date) return;

    const logged = await this.prisma.transaction.findFirst({
      where: { loggedByUserId: user.id, createdAt: { gte: new Date(day.startOfDayMs) } },
      select: { id: true },
    });
    if (logged) return;

    const { title, body } = reminderCopy(user.displayName, dayIndex);
    await this.push?.sendToUserDevices(user.id, { title, body, url: '/chat' });

    await this.stamp(user.id, user.preferences, day.date);
  }

  /** Record that we nudged this user today, preserving other preferences. */
  private async stamp(userId: string, current: unknown, date: string): Promise<void> {
    const merged = { ...parsePreferences(current), lastDailyReminderAt: date };
    await this.prisma.user.update({
      where: { id: userId },
      data: { preferences: merged as unknown as Prisma.InputJsonValue },
    });
  }

  private describe(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
