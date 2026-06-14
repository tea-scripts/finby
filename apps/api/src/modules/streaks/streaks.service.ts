import { ConflictException, Injectable } from '@nestjs/common';
import { TIER_LIMITS, type SubscriptionTier } from '@finby/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { localDayInfo, previousLocalDate } from '../reminders/reminders.time';
import { STREAK_ERRORS, type StreakStatusView } from './streaks.types';

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

  /** Resolve "today" as a YYYY-MM-DD local date in the user's timezone,
   *  falling back to UTC on an invalid timezone string. */
  private localToday(timezone: string | null): string {
    try {
      return localDayInfo(new Date(), timezone || 'UTC').date;
    } catch {
      return localDayInfo(new Date(), 'UTC').date;
    }
  }

  /** A streak is at risk when exactly yesterday was missed (last log was the
   *  day before yesterday) and today hasn't been logged yet. */
  private isAtRisk(currentStreak: number, lastStreakDate: string | null, today: string): boolean {
    if (currentStreak < 1 || !lastStreakDate) return false;
    const dayBeforeYesterday = previousLocalDate(previousLocalDate(today));
    return lastStreakDate === dayBeforeYesterday;
  }

  /** Whether a repair was already used in the current calendar month. */
  private repairUsedThisMonth(lastStreakRepairDate: string | null, today: string): boolean {
    return !!lastStreakRepairDate && lastStreakRepairDate.slice(0, 7) === today.slice(0, 7);
  }

  /** Live streak status for the requesting user (un-gated; tier decides
   *  repairEligible so Free users can be shown an upsell). */
  async getStatus(userId: string, tier: SubscriptionTier): Promise<StreakStatusView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        timezone: true,
        currentStreak: true,
        longestStreak: true,
        lastStreakDate: true,
        lastStreakRepairDate: true,
      },
    });
    if (!user) {
      return {
        currentStreak: 0,
        longestStreak: 0,
        atRisk: false,
        repairEligible: false,
        repairUsedThisMonth: false,
      };
    }

    const today = this.localToday(user.timezone);
    const atRisk = this.isAtRisk(user.currentStreak, user.lastStreakDate, today);
    const repairUsedThisMonth = this.repairUsedThisMonth(user.lastStreakRepairDate, today);

    return {
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
      atRisk,
      repairUsedThisMonth,
      repairEligible: atRisk && TIER_LIMITS[tier].streakRepair && !repairUsedThisMonth,
    };
  }

  /** Recover a single missed day. Caller (controller) enforces the PRO+ gate;
   *  this re-validates at-risk + the monthly cap and applies an atomic,
   *  state-guarded update so concurrent calls can't double-repair. */
  async repair(userId: string): Promise<StreakStatusView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        timezone: true,
        currentStreak: true,
        longestStreak: true,
        lastStreakDate: true,
        lastStreakRepairDate: true,
      },
    });

    const notAtRisk = new ConflictException({
      error: STREAK_ERRORS.NOT_AT_RISK,
      message: 'Your streak isn’t at risk right now.',
    });
    // Unreachable in practice (auth guarantees the user). Collapse into the
    // same not-at-risk response rather than leaking a distinct error.
    if (!user) throw notAtRisk;

    const today = this.localToday(user.timezone);
    if (!this.isAtRisk(user.currentStreak, user.lastStreakDate, today)) {
      throw notAtRisk;
    }
    if (this.repairUsedThisMonth(user.lastStreakRepairDate, today)) {
      throw new ConflictException({
        error: STREAK_ERRORS.ALREADY_USED,
        message: 'You’ve already repaired a streak this month.',
      });
    }

    const yesterday = previousLocalDate(today);
    const dayBeforeYesterday = previousLocalDate(yesterday);

    // State-guarded update: only fires while last activity is still the day
    // before yesterday, so a concurrent repair/log can't double-apply.
    const res = await this.prisma.user.updateMany({
      where: { id: userId, lastStreakDate: dayBeforeYesterday },
      data: { lastStreakDate: yesterday, lastStreakRepairDate: today },
    });
    if (res.count === 0) throw notAtRisk;

    return {
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
      atRisk: false,
      repairUsedThisMonth: true,
      repairEligible: false,
    };
  }
}
