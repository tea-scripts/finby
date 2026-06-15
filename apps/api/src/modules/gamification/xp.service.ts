import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, SubscriptionTier, XpEvent } from '@prisma/client';
import type { UserXp, XpTransaction } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { localDayInfo } from '../reminders/reminders.time';
import { XP_BASE, XP_MULTIPLIER } from './xp.constants';

/** XP is a per-user balance. Earn events grant `XP_BASE[event] * tierMultiplier`;
 *  spend actions deduct a fixed cost. Balance and lifetime totals are kept on
 *  UserXp; every change is journalled as an XpTransaction. */
@Injectable()
export class XpService {
  constructor(private readonly prisma: PrismaService) {}

  /** Grant XP for an earn event, scaled by the workspace tier. Creates the
   *  ledger row and upserts the running balance/total in one transaction. */
  async awardXp(
    userId: string,
    tier: SubscriptionTier,
    event: XpEvent,
    meta?: Record<string, unknown>,
  ): Promise<XpTransaction> {
    const delta = XP_BASE[event] * XP_MULTIPLIER[tier];
    const [transaction] = await this.prisma.$transaction([
      this.prisma.xpTransaction.create({
        data: { userId, event, delta, meta: this.toJson(meta) },
      }),
      this.prisma.userXp.upsert({
        where: { userId },
        create: { userId, balance: delta, totalEarned: delta },
        update: { balance: { increment: delta }, totalEarned: { increment: delta } },
      }),
    ]);
    return transaction;
  }

  /** Deduct a fixed XP cost. Throws if the balance can't cover it. totalEarned
   *  is never reduced — it tracks lifetime earnings, not the current balance. */
  async spendXp(
    userId: string,
    cost: number,
    event: XpEvent,
    meta?: Record<string, unknown>,
  ): Promise<UserXp> {
    const xp = await this.prisma.userXp.findUnique({ where: { userId } });
    if (!xp || xp.balance < cost) {
      throw new BadRequestException('Insufficient XP');
    }
    const [, updated] = await this.prisma.$transaction([
      this.prisma.xpTransaction.create({
        data: { userId, event, delta: -cost, meta: this.toJson(meta) },
      }),
      this.prisma.userXp.update({
        where: { userId },
        data: { balance: { decrement: cost } },
      }),
    ]);
    return updated;
  }

  /** Current balance, lifetime earnings, and XP earned so far on the user's
   *  local calendar day (positive deltas only). */
  async getXpSummary(
    userId: string,
  ): Promise<{ balance: number; totalEarned: number; todayEarned: number }> {
    const [user, xp] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
      this.prisma.userXp.findUnique({ where: { userId } }),
    ]);

    const startOfToday = this.startOfLocalDay(user?.timezone ?? null);
    const today = await this.prisma.xpTransaction.aggregate({
      _sum: { delta: true },
      where: { userId, delta: { gt: 0 }, createdAt: { gte: startOfToday } },
    });

    return {
      balance: xp?.balance ?? 0,
      totalEarned: xp?.totalEarned ?? 0,
      todayEarned: today._sum.delta ?? 0,
    };
  }

  /** Most recent XP ledger entries, newest first. */
  async getXpHistory(userId: string, limit = 20): Promise<XpTransaction[]> {
    return this.prisma.xpTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /** Start of the user's local day as an instant, with the same UTC fallback the
   *  streak/reminder code uses for an invalid timezone string. */
  private startOfLocalDay(timezone: string | null): Date {
    const now = new Date();
    try {
      return new Date(localDayInfo(now, timezone || 'UTC').startOfDayMs);
    } catch {
      return new Date(localDayInfo(now, 'UTC').startOfDayMs);
    }
  }

  private toJson(meta?: Record<string, unknown>): Prisma.InputJsonValue | undefined {
    return meta === undefined ? undefined : (meta as Prisma.InputJsonValue);
  }
}
