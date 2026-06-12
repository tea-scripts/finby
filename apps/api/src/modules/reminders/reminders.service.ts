import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { parsePreferences } from '../auth/preferences.util';
import { localDayInfo } from './reminders.time';
import { dayOfYearUtc, reminderCopy } from './reminders.copy';
import { summaryCopy, type DailySummary } from './summary.copy';

/** Local hour (0-23) at which the daily nudge fires. */
const REMINDER_HOUR = 20; // ~8pm local

interface ReminderUser {
  id: string;
  displayName: string;
  timezone: string;
  preferences: unknown;
  currentStreak: number;
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
      select: {
        id: true,
        displayName: true,
        timezone: true,
        preferences: true,
        currentStreak: true,
      },
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

    // We filter on `createdAt` (server-recorded time) rather than `transactionDate`
    // because transactionDate is user-editable and can be back/forward-dated, whereas
    // createdAt reliably reflects when the user was last active in the app today.
    const active = await this.prisma.transaction.findFirst({
      where: { loggedByUserId: user.id, createdAt: { gte: new Date(day.startOfDayMs) } },
      select: { currencyBase: true },
    });

    // Active today: send a contextual spending summary (deep-linked to the
    // dashboard) instead of staying silent. If there's nothing summarisable
    // (e.g. only income or only voided entries today), fall through to the nudge.
    if (active) {
      const summary = await this.getDailySummary(user.id, day.startOfDayMs, active.currencyBase);
      if (summary) {
        const { title, body } = summaryCopy(user.displayName, summary, user.currentStreak);
        await this.push?.sendToUserDevices(user.id, { title, body, url: '/dashboard' });
        await this.stamp(user.id, user.preferences, day.date);
        return;
      }
    }

    const { title, body } = reminderCopy(user.displayName, dayIndex);
    await this.push?.sendToUserDevices(user.id, { title, body, url: '/chat' });

    await this.stamp(user.id, user.preferences, day.date);
  }

  /** Roll up the day's spending for the summary notification: total expense in
   *  the base currency plus the top-spend category. Returns null when there is
   *  no expense today (caller then falls back to the reminder nudge). */
  private async getDailySummary(
    userId: string,
    startOfDayMs: number,
    currency: string,
  ): Promise<DailySummary | null> {
    const baseWhere = {
      loggedByUserId: userId,
      createdAt: { gte: new Date(startOfDayMs) },
      status: { not: 'VOID' as const },
      type: 'EXPENSE' as const,
    };

    const agg = await this.prisma.transaction.aggregate({
      where: baseWhere,
      _sum: { amountBase: true },
      _count: true,
    });
    if (!agg._count) return null;
    const totalBase = agg._sum.amountBase != null ? agg._sum.amountBase.toString() : '0';

    const grouped = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { ...baseWhere, categoryId: { not: null } },
      _sum: { amountBase: true },
      orderBy: { _sum: { amountBase: 'desc' } },
      take: 1,
    });

    let topCategory: string | null = null;
    const topCategoryId = grouped[0]?.categoryId;
    if (topCategoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: topCategoryId },
        select: { name: true },
      });
      topCategory = category?.name ?? null;
    }

    return { totalBase, currency, topCategory };
  }

  /** Record that we nudged this user today, preserving other preferences.
   *  Note: re-parsing `current` (passed at call-time) means a concurrent profile
   *  update could theoretically be clobbered, but collision frequency is negligible. */
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
