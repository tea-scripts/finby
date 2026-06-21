import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Account } from '@prisma/client';
import type { SubscriptionTier } from '@finby/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { FxService } from '../fx/fx.service';
import { BudgetsService } from '../budgets/budgets.service';
import { AlertsService } from '../alerts/alerts.service';
import { StreaksService } from '../streaks/streaks.service';
import type { NewAchievement } from '../streaks/streaks.types';
import type { BudgetSpendChange } from '../budgets/budgets.types';
import type { ListTransactionsQuery, UpdateTransactionInput } from './dto/transactions.schemas';
import type {
  CreateTransactionParams,
  CreateTransactionResult,
  TransactionListResult,
  TransactionView,
} from './transactions.types';

const FREE_HISTORY_DAYS = 90;

const VIEW_INCLUDE = {
  category: { select: { id: true, name: true } },
  fromAccount: { select: { id: true, name: true } },
} as const;

type TxWithRelations = Prisma.TransactionGetPayload<{ include: typeof VIEW_INCLUDE }>;

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fx: FxService,
    private readonly budgets: BudgetsService,
    private readonly alerts: AlertsService,
    private readonly streaks: StreaksService,
  ) {}

  async create(params: CreateTransactionParams): Promise<CreateTransactionResult> {
    const status = params.status ?? 'CONFIRMED';
    const dateOnly = params.transactionDate.slice(0, 10);

    const fromAccount = params.accountId
      ? await this.requireAccount(params.workspaceId, params.accountId)
      : null;
    const toAccount = params.toAccountId
      ? await this.requireAccount(params.workspaceId, params.toAccountId)
      : null;

    if (fromAccount && fromAccount.currency.toUpperCase() !== params.currencyOriginal.toUpperCase()) {
      throw new UnprocessableEntityException(
        `Account currency (${fromAccount.currency}) must match the transaction currency (${params.currencyOriginal}).`,
      );
    }

    const conversion = await this.fx.convertToBase({
      workspaceId: params.workspaceId,
      amount: params.amountOriginal,
      from: params.currencyOriginal,
      to: params.baseCurrency,
      date: dateOnly,
    });

    const fromDelta = params.amountOriginal;
    const toDelta = toAccount
      ? await this.fx.convertAmount(
          params.amountOriginal,
          params.currencyOriginal,
          toAccount.currency,
          dateOnly,
        )
      : null;

    const txDate = new Date(dateOnly);
    const { created, budgetChange } = await this.prisma.$transaction(async (txc) => {
      const transaction = await txc.transaction.create({
        data: {
          workspaceId: params.workspaceId,
          loggedByUserId: params.loggedByUserId,
          type: params.type,
          status,
          amountOriginal: params.amountOriginal,
          currencyOriginal: params.currencyOriginal,
          amountBase: conversion.amountBase,
          currencyBase: params.baseCurrency,
          fxRateUsed: conversion.fxRateUsed,
          fxRateTimestamp: conversion.fxRateTimestamp,
          categoryId: params.categoryId ?? null,
          fromAccountId: params.accountId ?? null,
          toAccountId: params.toAccountId ?? null,
          merchant: params.merchant ?? null,
          description: params.description ?? null,
          transactionDate: txDate,
          tags: params.tags ?? [],
          aiConfidence: params.aiConfidence ?? null,
          sourceMessageId: params.sourceMessageId ?? null,
          ...(params.createdAt ? { createdAt: params.createdAt } : {}),
        },
        include: VIEW_INCLUDE,
      });

      let change: BudgetSpendChange | null = null;
      if (status === 'CONFIRMED') {
        await this.applyBalances(
          txc,
          params.type,
          params.accountId,
          params.toAccountId,
          fromDelta,
          toDelta,
          1,
        );
        if (params.type === 'EXPENSE' && params.categoryId) {
          change = await this.budgets.applyTransactionSpend(txc, {
            workspaceId: params.workspaceId,
            categoryId: params.categoryId,
            transactionDate: txDate,
            amountBase: conversion.amountBase,
            sign: 1,
          });
        }
      }

      return { created: transaction, budgetChange: change };
    });

    // Budget threshold alerts are non-critical and fire after the financial
    // write commits — a failure here must not roll back the transaction.
    if (budgetChange && params.categoryId) {
      try {
        await this.alerts.generateBudgetAlert({
          workspaceId: params.workspaceId,
          userId: params.loggedByUserId,
          budgetId: budgetChange.budgetId,
          categoryId: params.categoryId,
          currency: params.baseCurrency,
          change: budgetChange,
        });
      } catch (error) {
        this.logger.error(
          `Budget alert generation failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Update the spending streak (which also awards XP and unlocks achievements)
    // and surface the results so callers (chat) can reflect them immediately. A
    // streak/gamification failure must never fail the transaction, so it's caught
    // and reported as a null streak with no new achievements.
    let currentStreak: number | null = null;
    let newAchievements: NewAchievement[] = [];
    if (!params.skipEngagement) {
      try {
        const streak = await this.streaks.onTransactionLogged(params.loggedByUserId, params.tier);
        currentStreak = streak.currentStreak;
        newAchievements = streak.newAchievements;
      } catch (error) {
        this.logger.error(
          `Streak update failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return { transaction: this.toView(created), budgetChange, currentStreak, newAchievements };
  }

  async list(
    workspaceId: string,
    tier: SubscriptionTier,
    query: ListTransactionsQuery,
  ): Promise<TransactionListResult> {
    let fromDate = query.fromDate ? new Date(query.fromDate) : undefined;
    if (tier === 'FREE') {
      const cap = new Date(Date.now() - FREE_HISTORY_DAYS * 86400000);
      if (!fromDate || fromDate.getTime() < cap.getTime()) {
        fromDate = cap;
      }
    }

    const dateFilter: Prisma.DateTimeFilter = {};
    if (fromDate) dateFilter.gte = fromDate;
    if (query.toDate) dateFilter.lte = new Date(query.toDate);

    const where: Prisma.TransactionWhereInput = {
      workspaceId,
      // Voided transactions are reversed and must never appear in the list
      // (dashboard "Recent Transactions" and the Transactions page both read
      // from here). PENDING is a legitimate display state, so exclude only VOID.
      status: { not: 'VOID' },
      ...(query.type ? { type: query.type } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.currency ? { currencyOriginal: query.currency } : {}),
      ...(Object.keys(dateFilter).length > 0 ? { transactionDate: dateFilter } : {}),
      ...(query.search
        ? {
            OR: [
              { merchant: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.transaction.findMany({
      where,
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: VIEW_INCLUDE,
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);

    return {
      transactions: page.map((row) => this.toView(row)),
      nextCursor: hasMore && last ? last.id : null,
      hasMore,
    };
  }

  async update(
    workspaceId: string,
    transactionId: string,
    input: UpdateTransactionInput,
  ): Promise<TransactionView> {
    const existing = await this.prisma.transaction.findFirst({
      where: { id: transactionId, workspaceId },
    });
    if (!existing) {
      throw new NotFoundException('Transaction not found.');
    }

    const newCategoryId = input.categoryId === undefined ? existing.categoryId : input.categoryId;
    const newDate = input.transactionDate
      ? new Date(input.transactionDate.slice(0, 10))
      : existing.transactionDate;
    const categoryChanged = newCategoryId !== existing.categoryId;
    const dateChanged = newDate.getTime() !== existing.transactionDate.getTime();

    // Re-attribution to a different account (e.g. the user logged income but
    // didn't say which account, then clarifies "that was into GCash"). Only
    // INCOME/EXPENSE are re-linkable here — TRANSFER carries two accounts and is
    // corrected by re-logging. A re-link reconciles both account balances.
    const accountChangeRequested = input.accountId !== undefined;
    const newAccountId = accountChangeRequested ? input.accountId : existing.fromAccountId;
    const accountChanged =
      accountChangeRequested &&
      existing.type !== 'TRANSFER' &&
      newAccountId !== existing.fromAccountId;

    if (accountChanged && newAccountId) {
      const target = await this.requireAccount(workspaceId, newAccountId);
      if (target.currency.toUpperCase() !== existing.currencyOriginal.toUpperCase()) {
        throw new UnprocessableEntityException(
          `Account currency (${target.currency}) must match the transaction currency (${existing.currencyOriginal}).`,
        );
      }
    }

    // Re-categorizing (or re-dating) a CONFIRMED expense must move the materialized
    // budget spend off the old budget and onto the new one — otherwise the old
    // category's budget keeps the spend forever and the new one never sees it.
    const reapplyBudget =
      existing.status === 'CONFIRMED' &&
      existing.type === 'EXPENSE' &&
      (categoryChanged || dateChanged);
    const reconcileBalance =
      existing.status === 'CONFIRMED' &&
      (existing.type === 'INCOME' || existing.type === 'EXPENSE') &&
      accountChanged;
    const amountBase = existing.amountBase.toString();
    const amountOriginal = existing.amountOriginal.toString();

    const updated = await this.prisma.$transaction(async (txc) => {
      if (reapplyBudget && existing.categoryId) {
        await this.budgets.applyTransactionSpend(txc, {
          workspaceId,
          categoryId: existing.categoryId,
          transactionDate: existing.transactionDate,
          amountBase,
          sign: -1,
        });
      }

      if (reconcileBalance) {
        const balanceType = existing.type as CreateTransactionParams['type'];
        // Reverse the effect on the old account (no-op if it was unattributed)…
        await this.applyBalances(txc, balanceType, existing.fromAccountId, null, amountOriginal, null, -1);
        // …and apply it to the new one (no-op if detaching to null).
        await this.applyBalances(txc, balanceType, newAccountId, null, amountOriginal, null, 1);
      }

      const row = await txc.transaction.update({
        where: { id: transactionId },
        data: {
          categoryId: input.categoryId,
          merchant: input.merchant,
          description: input.description,
          tags: input.tags,
          ...(accountChanged ? { fromAccountId: newAccountId } : {}),
          ...(input.transactionDate ? { transactionDate: newDate } : {}),
        },
        include: VIEW_INCLUDE,
      });

      if (reapplyBudget && newCategoryId) {
        await this.budgets.applyTransactionSpend(txc, {
          workspaceId,
          categoryId: newCategoryId,
          transactionDate: newDate,
          amountBase,
          sign: 1,
        });
      }

      return row;
    });

    return this.toView(updated);
  }

  /** Resolve the most recent non-voided transaction for conversational correction.
   *  The LLM never sees transaction IDs across turns, so corrections target the
   *  latest match — optionally narrowed by merchant/amount to disambiguate. */
  async findLatestForCorrection(
    workspaceId: string,
    filter: { type?: 'EXPENSE' | 'INCOME'; merchant?: string; amountOriginal?: string },
  ): Promise<TransactionView | null> {
    const row = await this.prisma.transaction.findFirst({
      where: {
        workspaceId,
        status: { not: 'VOID' },
        ...(filter.type ? { type: filter.type } : {}),
        ...(filter.merchant
          ? { merchant: { contains: filter.merchant, mode: 'insensitive' } }
          : {}),
        ...(filter.amountOriginal ? { amountOriginal: new Prisma.Decimal(filter.amountOriginal) } : {}),
      },
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      include: VIEW_INCLUDE,
    });
    return row ? this.toView(row) : null;
  }

  async void(workspaceId: string, transactionId: string): Promise<{ message: string }> {
    const existing = await this.prisma.transaction.findFirst({
      where: { id: transactionId, workspaceId },
    });
    if (!existing) {
      throw new NotFoundException('Transaction not found.');
    }
    if (existing.status === 'VOID') {
      return { message: 'Transaction already voided.' };
    }

    const fromDelta = existing.amountOriginal.toString();
    let toDelta: string | null = null;
    if (existing.type === 'TRANSFER' && existing.toAccountId) {
      const toAccount = await this.prisma.account.findUnique({
        where: { id: existing.toAccountId },
      });
      if (toAccount) {
        toDelta = await this.fx.convertAmount(
          fromDelta,
          existing.currencyOriginal,
          toAccount.currency,
          existing.transactionDate.toISOString().slice(0, 10),
        );
      }
    }

    await this.prisma.$transaction(async (txc) => {
      await txc.transaction.update({ where: { id: transactionId }, data: { status: 'VOID' } });
      if (existing.status === 'CONFIRMED') {
        await this.applyBalances(
          txc,
          existing.type as CreateTransactionParams['type'],
          existing.fromAccountId,
          existing.toAccountId,
          fromDelta,
          toDelta,
          -1,
        );
        if (existing.type === 'EXPENSE' && existing.categoryId) {
          await this.budgets.applyTransactionSpend(txc, {
            workspaceId,
            categoryId: existing.categoryId,
            transactionDate: existing.transactionDate,
            amountBase: existing.amountBase.toString(),
            sign: -1,
          });
        }
      }
    });

    return { message: 'Transaction voided.' };
  }

  private async requireAccount(workspaceId: string, accountId: string): Promise<Account> {
    const account = await this.prisma.account.findFirst({ where: { id: accountId, workspaceId } });
    if (!account) {
      throw new NotFoundException('Account not found.');
    }
    return account;
  }

  private async applyBalances(
    txc: Prisma.TransactionClient,
    type: CreateTransactionParams['type'],
    fromAccountId: string | null | undefined,
    toAccountId: string | null | undefined,
    fromDelta: string,
    toDelta: string | null,
    sign: 1 | -1,
  ): Promise<void> {
    // sign=1 applies the transaction, sign=-1 reverses it.
    const expenseDir = sign === 1 ? 'decrement' : 'increment';
    const incomeDir = sign === 1 ? 'increment' : 'decrement';

    if (type === 'EXPENSE' && fromAccountId) {
      await txc.account.update({
        where: { id: fromAccountId },
        data: { balance: { [expenseDir]: fromDelta } },
      });
    } else if (type === 'INCOME' && fromAccountId) {
      await txc.account.update({
        where: { id: fromAccountId },
        data: { balance: { [incomeDir]: fromDelta } },
      });
    } else if (type === 'TRANSFER') {
      if (fromAccountId) {
        await txc.account.update({
          where: { id: fromAccountId },
          data: { balance: { [expenseDir]: fromDelta } },
        });
      }
      if (toAccountId && toDelta) {
        await txc.account.update({
          where: { id: toAccountId },
          data: { balance: { [incomeDir]: toDelta } },
        });
      }
    }
  }

  private toView(row: TxWithRelations): TransactionView {
    return {
      id: row.id,
      type: row.type,
      status: row.status,
      amountOriginal: row.amountOriginal.toString(),
      currencyOriginal: row.currencyOriginal,
      amountBase: row.amountBase.toString(),
      currencyBase: row.currencyBase,
      fxRateUsed: row.fxRateUsed.toString(),
      merchant: row.merchant,
      description: row.description,
      category: row.category ? { id: row.category.id, name: row.category.name } : null,
      account: row.fromAccount ? { id: row.fromAccount.id, name: row.fromAccount.name } : null,
      transactionDate: row.transactionDate.toISOString(),
      tags: row.tags,
      aiConfidence: row.aiConfidence,
      loggedByUserId: row.loggedByUserId,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
