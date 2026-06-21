import { Injectable } from '@nestjs/common';
import type { SubscriptionTier } from '@finby/shared';
import { XpEvent } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LlmService } from '../../llm/llm.service';
import { TransactionsService } from '../../transactions/transactions.service';
import { CategoriesService } from '../../categories/categories.service';
import { AccountsService } from '../../accounts/accounts.service';
import { StreaksService } from '../../streaks/streaks.service';
import { XpService } from '../../gamification/xp.service';
import { computeStreakFromActiveDays } from '../../streaks/streaks.recompute';
import { bucketLocalDays } from '../../streaks/streaks.calendar';
import { XP_BASE, XP_MULTIPLIER, STREAK_MILESTONES } from '../../gamification/xp.constants';
import { previousLocalDate } from '../../reminders/reminders.time';

export interface StreakRestoreResult {
  before: { currentStreak: number; longestStreak: number };
  after: { currentStreak: number; longestStreak: number };
  xpAwards: Array<{ date: string; event: 'STREAK_DAY' | 'STREAK_MILESTONE'; delta: number }>;
}

export interface ReconstructedTransaction {
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  amountOriginal: string;
  currencyOriginal: string;
  categoryName: string | null;
  accountName: string | null;
  merchant: string | null;
  transactionDate: string;
  confidence: number;
  needsManual: boolean;
}

const LOG_TOOL_TYPE: Record<string, 'EXPENSE' | 'INCOME' | 'TRANSFER'> = {
  log_expense: 'EXPENSE',
  log_income: 'INCOME',
  log_transfer: 'TRANSFER',
};

const asString = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  return trimmed ? trimmed : undefined;
};
const asNumber = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

@Injectable()
export class ChatRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly transactions: TransactionsService,
    private readonly categories: CategoriesService,
    private readonly accounts: AccountsService,
    private readonly streaks: StreaksService,
    private readonly xp: XpService,
  ) {}

  async reconstructTurn(input: {
    workspace: { id: string; baseCurrency: string; tier: SubscriptionTier };
    user: { displayName: string; timezone: string };
    accounts: Array<{ name: string; currency: string }>;
    categories: string[];
    userText: string;
    messageLocalDate: string;
  }): Promise<ReconstructedTransaction | null> {
    const system = this.llm.buildSystemPrompt({
      user: { displayName: input.user.displayName, timezone: input.user.timezone },
      workspace: { baseCurrency: input.workspace.baseCurrency, tier: input.workspace.tier },
      accounts: input.accounts,
      categories: input.categories,
      budgets: [],
      today: input.messageLocalDate, // pin "today" to the day the user spoke
    });

    const response = await this.llm.createMessage({
      system,
      messages: [{ role: 'user', content: input.userText }],
      tools: this.llm.getTools(),
    });

    const call = response.toolCalls.find((c) => c.name in LOG_TOOL_TYPE);
    if (!call) return null; // not a logging intent

    const type = LOG_TOOL_TYPE[call.name]!;
    const amountOriginal = asString(call.input.amountOriginal);
    const currencyOriginal = asString(call.input.currencyOriginal)?.toUpperCase();
    if (!amountOriginal || !currencyOriginal) return null;

    return {
      type,
      amountOriginal,
      currencyOriginal,
      categoryName: asString(call.input.categoryName) ?? null,
      accountName: asString(call.input.accountName) ?? null,
      merchant: asString(call.input.merchant) ?? null,
      transactionDate: (asString(call.input.transactionDate) ?? input.messageLocalDate).slice(0, 10),
      confidence: asNumber(call.input.confidence) ?? 1,
      needsManual: type === 'TRANSFER',
    };
  }

  async restoreUserStreakAndXp(input: {
    userId: string;
    tier: SubscriptionTier;
    timezone: string;
    recoveredDates: string[];
    commit: boolean;
  }): Promise<StreakRestoreResult> {
    const tz = input.timezone || 'UTC';

    const txns = await this.prisma.transaction.findMany({
      where: { loggedByUserId: input.userId },
      select: { createdAt: true },
    });
    const activeDays = bucketLocalDays(txns.map((t) => t.createdAt), tz);

    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { currentStreak: true, longestStreak: true },
    });
    const before = {
      currentStreak: user?.currentStreak ?? 0,
      longestStreak: user?.longestStreak ?? 0,
    };

    const recomputed = computeStreakFromActiveDays(activeDays);
    const after = {
      currentStreak: recomputed.currentStreak,
      longestStreak: recomputed.longestStreak,
    };

    if (input.commit) {
      await this.prisma.user.update({
        where: { id: input.userId },
        data: {
          currentStreak: recomputed.currentStreak,
          longestStreak: recomputed.longestStreak,
          lastStreakDate: recomputed.lastStreakDate,
        },
      });
    }

    // Which dates already have STREAK_DAY / STREAK_MILESTONE XP.
    const existing = await this.prisma.xpTransaction.findMany({
      where: { userId: input.userId, event: { in: [XpEvent.STREAK_DAY, XpEvent.STREAK_MILESTONE] } },
      select: { event: true, meta: true },
    });
    const credited = new Set<string>();
    for (const row of existing) {
      const date = (row.meta as { date?: string } | null)?.date;
      if (date) credited.add(`${row.event}:${date}`);
    }

    // Streak length at each active day, so we can tell whether a recovered date
    // is a milestone day in the corrected timeline.
    const activeSet = new Set(activeDays);
    const streakLenAt = (date: string): number => {
      let len = 1;
      let cursor = date;
      while (activeSet.has(previousLocalDate(cursor))) {
        len += 1;
        cursor = previousLocalDate(cursor);
      }
      return len;
    };

    const xpAwards: StreakRestoreResult['xpAwards'] = [];
    const mult = XP_MULTIPLIER[input.tier];

    for (const date of [...new Set(input.recoveredDates)].sort()) {
      if (!activeSet.has(date)) continue; // recovered row didn't land on this local day
      const dayKey = `${XpEvent.STREAK_DAY}:${date}`;
      if (!credited.has(dayKey)) {
        const delta = XP_BASE[XpEvent.STREAK_DAY] * mult;
        xpAwards.push({ date, event: 'STREAK_DAY', delta });
        if (input.commit) {
          await this.xp.awardXp(input.userId, input.tier, XpEvent.STREAK_DAY, {
            date, source: 'chat-recovery',
          });
        }
        credited.add(dayKey);
      }
      const len = streakLenAt(date);
      const mileKey = `${XpEvent.STREAK_MILESTONE}:${date}`;
      if (STREAK_MILESTONES.has(len) && !credited.has(mileKey)) {
        const delta = XP_BASE[XpEvent.STREAK_MILESTONE] * mult;
        xpAwards.push({ date, event: 'STREAK_MILESTONE', delta });
        if (input.commit) {
          await this.xp.awardXp(input.userId, input.tier, XpEvent.STREAK_MILESTONE, {
            date, source: 'chat-recovery',
          });
        }
        credited.add(mileKey);
      }
    }

    return { before, after, xpAwards };
  }
}
