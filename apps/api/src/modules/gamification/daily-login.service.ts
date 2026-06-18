import { Injectable } from '@nestjs/common';
import { XpEvent } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { localDayInfo } from '../reminders/reminders.time';
import { XpService } from './xp.service';

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
   *  calendar day. Returns true only when this call performed the award.
   *  `now` is injectable for tests. */
  async awardIfFirstToday(userId: string, now = new Date()): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        timezone: true,
        workspaceMemberships: {
          orderBy: { joinedAt: 'asc' },
          take: 1,
          select: { workspace: { select: { tier: true } } },
        },
      },
    });
    if (!user) return false;

    const tier = user.workspaceMemberships[0]?.workspace.tier;
    if (!tier) return false;

    let today: string;
    try {
      today = localDayInfo(now, user.timezone || 'UTC').date;
    } catch {
      today = localDayInfo(now, 'UTC').date; // bad tz string -> treat as UTC
    }

    // State-guarded write: only the request that flips lastDailyXpDate to today
    // proceeds to award. Prisma's `not` filter also matches NULL rows, so a
    // brand-new user (lastDailyXpDate === null) is awarded on first activity.
    const { count } = await this.prisma.user.updateMany({
      where: { id: userId, lastDailyXpDate: { not: today } },
      data: { lastDailyXpDate: today },
    });
    if (count === 0) return false;

    await this.xpService.awardXp(userId, tier, XpEvent.DAILY_LOGIN, { date: today });
    return true;
  }
}
