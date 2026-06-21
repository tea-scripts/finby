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
import { localDayInfo, previousLocalDate } from '../../reminders/reminders.time';
import { detectDroppedTurns, type TranscriptMessage } from './dropped-turn-detector';

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

export interface RecoveryReport {
  commit: boolean;
  since: string;
  candidates: number;
  inserted: Array<{
    userId: string;
    conversationId: string;
    userMessageId: string;
    type: string;
    amountOriginal: string;
    currencyOriginal: string;
    categoryName: string | null;
    transactionDate: string;
    confidence: number;
  }>;
  needsManual: Array<{
    userId: string;
    conversationId: string;
    userMessageId: string;
    userText: string;
  }>;
  failed: Array<{
    userId: string;
    conversationId: string;
    userMessageId: string;
    error: string;
  }>;
  skippedAlreadyRecovered: number;
  notLoggingIntent: number;
  streakRestores: Array<{ userId: string } & StreakRestoreResult>;
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

  /** An instant that falls on `localDate` in the user's timezone for streak/
   *  calendar bucketing. Noon UTC is safe for all timezones within ±12h. */
  private createdAtForDate(localDate: string): Date {
    return new Date(`${localDate}T12:00:00.000Z`);
  }

  private localDateOf(at: Date, timezone: string | null): string {
    try {
      return localDayInfo(at, timezone || 'UTC').date;
    } catch {
      return localDayInfo(at, 'UTC').date;
    }
  }

  async run(opts: { since: string; commit: boolean }): Promise<RecoveryReport> {
    const sinceDate = new Date(`${opts.since}T00:00:00.000Z`);
    const report: RecoveryReport = {
      commit: opts.commit,
      since: opts.since,
      candidates: 0,
      inserted: [],
      needsManual: [],
      failed: [],
      skippedAlreadyRecovered: 0,
      notLoggingIntent: 0,
      streakRestores: [],
    };

    const conversations = await this.prisma.conversation.findMany({
      where: { messages: { some: { createdAt: { gte: sinceDate } } } },
      select: {
        id: true,
        userId: true,
        workspaceId: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            role: true,
            content: true,
            toolName: true,
            createdTransactionId: true,
            createdAt: true,
          },
        },
      },
    });

    const recoveredDatesByUser = new Map<
      string,
      { tier: SubscriptionTier; timezone: string; dates: Set<string> }
    >();

    for (const convo of conversations) {
      const [workspace, user] = await Promise.all([
        this.prisma.workspace.findUnique({
          where: { id: convo.workspaceId },
          select: { tier: true, baseCurrency: true },
        }),
        this.prisma.user.findUnique({
          where: { id: convo.userId },
          select: { displayName: true, timezone: true },
        }),
      ]);
      if (!workspace || !user) continue;

      const [accountRows, categoryRows] = await Promise.all([
        this.prisma.account.findMany({
          where: { workspaceId: convo.workspaceId, isArchived: false },
          select: { name: true, currency: true },
        }),
        this.prisma.category.findMany({
          where: { workspaceId: convo.workspaceId, isArchived: false },
          select: { name: true },
        }),
      ]);

      // Idempotency: user-message ids that already produced a transaction.
      const userMsgIds = convo.messages.filter((m) => m.role === 'USER').map((m) => m.id);
      const existingTx = await this.prisma.transaction.findMany({
        where: { sourceMessageId: { in: userMsgIds } },
        select: { sourceMessageId: true },
      });
      const alreadyRecovered = new Set(
        existingTx.map((t) => t.sourceMessageId).filter((v): v is string => !!v),
      );

      const dropped = detectDroppedTurns(
        convo.messages.map((m) => ({
          id: m.id,
          role: m.role as TranscriptMessage['role'],
          toolName: m.toolName,
          createdTransactionId: m.createdTransactionId,
          createdAt: m.createdAt,
        })),
        { alreadyRecoveredUserMessageIds: alreadyRecovered },
      );
      report.skippedAlreadyRecovered += userMsgIds.filter((id) => alreadyRecovered.has(id)).length;

      for (const turn of dropped) {
        const msg = convo.messages.find((m) => m.id === turn.userMessageId)!;
        report.candidates += 1;
        try {
          const messageLocalDate = this.localDateOf(msg.createdAt, user.timezone);
          const recon = await this.reconstructTurn({
            workspace: { id: convo.workspaceId, baseCurrency: workspace.baseCurrency, tier: workspace.tier },
            user: { displayName: user.displayName, timezone: user.timezone },
            accounts: accountRows,
            categories: categoryRows.map((c) => c.name),
            userText: msg.content,
            messageLocalDate,
          });

          if (!recon) {
            report.notLoggingIntent += 1;
            continue;
          }

          if (recon.needsManual) {
            report.needsManual.push({
              userId: convo.userId,
              conversationId: convo.id,
              userMessageId: turn.userMessageId,
              userText: msg.content,
            });
            continue;
          }

          if (opts.commit) {
            const category = recon.categoryName
              ? ((await this.categories.findByName(convo.workspaceId, recon.categoryName)) ??
                 (await this.categories.findByName(convo.workspaceId, 'Other')))
              : null;
            const account = recon.accountName
              ? await this.accounts.findByName(convo.workspaceId, recon.accountName)
              : null;
            await this.transactions.create({
              workspaceId: convo.workspaceId,
              loggedByUserId: convo.userId,
              baseCurrency: workspace.baseCurrency,
              tier: workspace.tier,
              type: recon.type as 'EXPENSE' | 'INCOME',
              amountOriginal: recon.amountOriginal,
              currencyOriginal: recon.currencyOriginal,
              transactionDate: recon.transactionDate,
              categoryId: category?.id ?? null,
              accountId: account?.id ?? null,
              merchant: recon.merchant,
              aiConfidence: recon.confidence,
              sourceMessageId: turn.userMessageId,
              tags: ['chat-recovery'],
              createdAt: this.createdAtForDate(recon.transactionDate),
              skipEngagement: true,
              status: 'CONFIRMED',
            });
          }

          report.inserted.push({
            userId: convo.userId,
            conversationId: convo.id,
            userMessageId: turn.userMessageId,
            type: recon.type,
            amountOriginal: recon.amountOriginal,
            currencyOriginal: recon.currencyOriginal,
            categoryName: recon.categoryName,
            transactionDate: recon.transactionDate,
            confidence: recon.confidence,
          });

          const bucket = recoveredDatesByUser.get(convo.userId) ?? {
            tier: workspace.tier,
            timezone: user.timezone,
            dates: new Set<string>(),
          };
          bucket.dates.add(recon.transactionDate);
          recoveredDatesByUser.set(convo.userId, bucket);
        } catch (err) {
          report.failed.push({
            userId: convo.userId,
            conversationId: convo.id,
            userMessageId: turn.userMessageId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    for (const [userId, info] of recoveredDatesByUser) {
      const restore = await this.restoreUserStreakAndXp({
        userId,
        tier: info.tier,
        timezone: info.timezone,
        recoveredDates: [...info.dates],
        commit: opts.commit,
      });
      report.streakRestores.push({ userId, ...restore });
    }

    return report;
  }
}
