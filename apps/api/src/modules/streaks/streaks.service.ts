import { ConflictException, Injectable } from '@nestjs/common';
import { AchievementCategory, XpEvent } from '@prisma/client';
import { type SubscriptionTier } from '@finby/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { localDayInfo, previousLocalDate } from '../reminders/reminders.time';
import { AchievementService } from '../gamification/achievement.service';
import { XpService } from '../gamification/xp.service';
import { STREAK_MILESTONES, XP_COST } from '../gamification/xp.constants';
import {
  STREAK_ERRORS,
  type NewAchievement,
  type StreakCalendarView,
  type StreakStatusView,
} from './streaks.types';
import { bucketLocalDays } from './streaks.calendar';

const DAY_MS = 24 * 60 * 60 * 1000;
/** ~6 months of history shown in the calendar. */
const CALENDAR_WINDOW_DAYS = 183;

/** Tracks consecutive local days on which a user logged at least one transaction.
 *  The day boundary is resolved in the user's own timezone (via localDayInfo),
 *  matching the reminder system — never from a raw UTC date. */
@Injectable()
export class StreaksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xpService: XpService,
    private readonly achievementService: AchievementService,
  ) {}

  /** Called after a transaction is saved. Idempotent per local day, so multiple
   *  transactions in one day only count (and earn XP) once. Returns the user's
   *  current streak plus any achievements unlocked by this log so callers can
   *  surface both immediately. */
  async onTransactionLogged(
    userId: string,
    tier: SubscriptionTier,
  ): Promise<{ currentStreak: number; newAchievements: NewAchievement[] }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true, currentStreak: true, longestStreak: true, lastStreakDate: true },
    });
    if (!user) return { currentStreak: 0, newAchievements: [] };

    let today: string;
    try {
      today = localDayInfo(new Date(), user.timezone || 'UTC').date;
    } catch {
      today = localDayInfo(new Date(), 'UTC').date; // bad tz string -> treat as UTC
    }

    // Already counted today — return the current streak unchanged, no new XP.
    if (user.lastStreakDate === today) {
      return { currentStreak: user.currentStreak, newAchievements: [] };
    }

    const consecutive = user.lastStreakDate === previousLocalDate(today);
    const currentStreak = consecutive ? user.currentStreak + 1 : 1;
    const longestStreak = Math.max(user.longestStreak, currentStreak);

    await this.prisma.user.update({
      where: { id: userId },
      data: { currentStreak, longestStreak, lastStreakDate: today },
    });

    // Gamification: daily XP, milestone bonus, and any streak badges unlocked.
    await this.xpService.awardXp(userId, tier, XpEvent.STREAK_DAY, { streakDay: currentStreak });
    if (STREAK_MILESTONES.has(currentStreak)) {
      await this.xpService.awardXp(userId, tier, XpEvent.STREAK_MILESTONE, {
        streakDay: currentStreak,
      });
    }
    const unlocked = await this.achievementService.checkAndUnlock(
      userId,
      AchievementCategory.STREAK,
      currentStreak,
    );
    const newAchievements: NewAchievement[] = unlocked.map((a) => ({
      slug: a.achievementDef.slug,
      tier: a.achievementDef.tier,
      label: a.achievementDef.label,
      unlockedAt: a.unlockedAt,
    }));

    return { currentStreak, newAchievements };
  }

  /** Resolve "today" as a YYYY-MM-DD local date in the user's timezone,
   *  falling back to UTC on an invalid timezone string. */
  private localToday(timezone: string | null): string {
    return this.dayInfo(new Date(), timezone).date;
  }

  /** Full local-day info with the same UTC fallback as localToday. */
  private dayInfo(now: Date, timezone: string | null): ReturnType<typeof localDayInfo> {
    try {
      return localDayInfo(now, timezone || 'UTC');
    } catch {
      return localDayInfo(now, 'UTC');
    }
  }

  /** Derive the streak calendar from transaction history over the last
   *  CALENDAR_WINDOW_DAYS. Active days are bucketed in the user's timezone so
   *  they line up with the streak count exactly. `now` is injectable for tests. */
  async getCalendar(userId: string, now = new Date()): Promise<StreakCalendarView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true, lastStreakRepairDate: true },
    });
    const tz = user?.timezone || 'UTC';

    const todayInfo = this.dayInfo(now, tz);
    const fromMs = todayInfo.startOfDayMs - (CALENDAR_WINDOW_DAYS - 1) * DAY_MS;
    const fromInfo = this.dayInfo(new Date(fromMs), tz);
    const from = fromInfo.date;
    const to = todayInfo.date;

    const txns = await this.prisma.transaction.findMany({
      where: { loggedByUserId: userId, createdAt: { gte: new Date(fromInfo.startOfDayMs) } },
      select: { createdAt: true },
    });
    const activeDays = bucketLocalDays(
      txns.map((t) => t.createdAt),
      tz,
    ).filter((d: string) => d >= from && d <= to);

    const repair = user?.lastStreakRepairDate ?? null;
    const repairedDays = repair && repair >= from && repair <= to ? [repair] : [];

    return { from, to, activeDays, repairedDays };
  }

  /** A streak is at risk when exactly yesterday was missed (last log was the
   *  day before yesterday) and today hasn't been logged yet. */
  private isAtRisk(currentStreak: number, lastStreakDate: string | null, today: string): boolean {
    if (currentStreak < 1 || !lastStreakDate) return false;
    const dayBeforeYesterday = previousLocalDate(previousLocalDate(today));
    return lastStreakDate === dayBeforeYesterday;
  }

  /** Live streak status for the requesting user. `_tier` is retained on the
   *  signature (the controller passes the workspace tier) but no longer gates
   *  repair — eligibility is now purely an XP-balance check, so every tier can
   *  recover a streak by spending XP. */
  async getStatus(userId: string, _tier: SubscriptionTier): Promise<StreakStatusView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        timezone: true,
        currentStreak: true,
        longestStreak: true,
        lastStreakDate: true,
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
    const userXp = await this.prisma.userXp.findUnique({ where: { userId } });

    return {
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
      atRisk,
      // Monthly cap removed; field kept for response-shape stability.
      repairUsedThisMonth: false,
      repairEligible: atRisk && (userXp?.balance ?? 0) >= XP_COST.STREAK_RECOVERY,
    };
  }

  /** Recover a single missed day by spending XP. Re-validates at-risk, charges
   *  the XP cost (spendXp throws 400 if the balance can't cover it), then applies
   *  an atomic, state-guarded update so concurrent calls can't double-repair. */
  async repair(userId: string): Promise<StreakStatusView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        timezone: true,
        currentStreak: true,
        longestStreak: true,
        lastStreakDate: true,
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

    const yesterday = previousLocalDate(today);
    const dayBeforeYesterday = previousLocalDate(yesterday);

    // Charge the XP cost up front. Throws BadRequestException('Insufficient XP')
    // when the balance is too low — that is the only repair gate now.
    await this.xpService.spendXp(userId, XP_COST.STREAK_RECOVERY, XpEvent.STREAK_RECOVERY, {
      recoveredDate: yesterday,
    });

    // State-guarded update: only fires while last activity is still the day
    // before yesterday, so a concurrent repair/log can't double-apply.
    const res = await this.prisma.user.updateMany({
      where: { id: userId, lastStreakDate: dayBeforeYesterday },
      data: { lastStreakDate: yesterday, lastStreakRepairDate: today },
    });
    if (res.count === 0) {
      // Lost a race to a concurrent transaction log that pushed the streak past
      // the at-risk window. With the monthly cap gone this is the only race
      // outcome left, so report it as not-at-risk.
      throw notAtRisk;
    }

    return {
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
      atRisk: false,
      repairUsedThisMonth: false,
      repairEligible: false,
    };
  }
}
