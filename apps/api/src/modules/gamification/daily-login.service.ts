import { Injectable } from '@nestjs/common';
import { SubscriptionTier, XpEvent } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { localDayInfo } from '../reminders/reminders.time';
import { XpService } from './xp.service';

/** The user fields needed to decide and grant the daily-login award. Callers
 *  that already hold the user row (e.g. AuthService.getMe) pass it via
 *  awardForContext to avoid a redundant findUnique on a hot path. */
export interface DailyLoginContext {
  timezone: string | null;
  tier: SubscriptionTier | null;
  lastDailyXpDate: string | null;
}

/** Grants a once-per-local-day "you opened the app" XP award, scaled by the
 *  user's workspace tier. Idempotency is enforced by a state-guarded updateMany
 *  on User.lastDailyXpDate, so concurrent first-of-day requests can't double-award. */
@Injectable()
export class DailyLoginService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xpService: XpService,
  ) {}

  /** Award the daily-login XP if the user hasn't earned it yet on their local
   *  calendar day, loading the user's timezone/tier/last-award date itself.
   *  Returns true only when this call performed the award. `now` is injectable
   *  for tests. */
  async awardIfFirstToday(userId: string, now = new Date()): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        timezone: true,
        lastDailyXpDate: true,
        workspaceMemberships: {
          orderBy: { joinedAt: 'asc' },
          take: 1,
          select: { workspace: { select: { tier: true } } },
        },
      },
    });
    if (!user) return false;

    return this.awardForContext(
      userId,
      {
        timezone: user.timezone,
        tier: user.workspaceMemberships[0]?.workspace.tier ?? null,
        lastDailyXpDate: user.lastDailyXpDate,
      },
      now,
    );
  }

  /** Award the daily-login XP from already-loaded user context, skipping the
   *  findUnique that awardIfFirstToday performs. The once-per-day check runs in
   *  memory first, so the common already-awarded path does no write at all. The
   *  state-guarded updateMany still protects against concurrent first-of-day
   *  requests — Prisma's `not` filter also matches the NULL of a brand-new user,
   *  so they are awarded on first activity. Returns true only when this call
   *  performed the award. */
  async awardForContext(
    userId: string,
    ctx: DailyLoginContext,
    now = new Date(),
  ): Promise<boolean> {
    if (!ctx.tier) return false;

    let today: string;
    try {
      today = localDayInfo(now, ctx.timezone || 'UTC').date;
    } catch {
      today = localDayInfo(now, 'UTC').date; // bad tz string -> treat as UTC
    }

    // Already awarded today — no write needed (the hot path on most requests).
    if (ctx.lastDailyXpDate === today) return false;

    const { count } = await this.prisma.user.updateMany({
      where: { id: userId, lastDailyXpDate: { not: today } },
      data: { lastDailyXpDate: today },
    });
    if (count === 0) return false;

    await this.xpService.awardXp(userId, ctx.tier, XpEvent.DAILY_LOGIN, { date: today });
    return true;
  }
}
