import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { localDayInfo, previousLocalDate } from '../reminders/reminders.time';

/** Tracks consecutive local days on which a user logged at least one transaction.
 *  The day boundary is resolved in the user's own timezone (via localDayInfo),
 *  matching the reminder system — never from a raw UTC date. */
@Injectable()
export class StreaksService {
  constructor(private readonly prisma: PrismaService) {}

  /** Called after a transaction is saved. Idempotent per local day, so multiple
   *  transactions in one day only count once. Returns the user's current streak
   *  after the update (or the unchanged value on a same-day repeat / 0 if the
   *  user is gone) so callers can surface it immediately. */
  async onTransactionLogged(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true, currentStreak: true, longestStreak: true, lastStreakDate: true },
    });
    if (!user) return 0;

    let today: string;
    try {
      today = localDayInfo(new Date(), user.timezone || 'UTC').date;
    } catch {
      today = localDayInfo(new Date(), 'UTC').date; // bad tz string -> treat as UTC
    }

    // Already counted today — return the current streak unchanged.
    if (user.lastStreakDate === today) return user.currentStreak;

    const consecutive = user.lastStreakDate === previousLocalDate(today);
    const currentStreak = consecutive ? user.currentStreak + 1 : 1;
    const longestStreak = Math.max(user.longestStreak, currentStreak);

    await this.prisma.user.update({
      where: { id: userId },
      data: { currentStreak, longestStreak, lastStreakDate: today },
    });

    return currentStreak;
  }
}
