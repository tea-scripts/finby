import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateBudgetInput, ListBudgetsQuery, UpdateBudgetInput } from './dto/budgets.schemas';
import type { BudgetPeriodP3, BudgetSpendChange, BudgetView, PeriodBounds } from './budgets.types';

type BudgetWithCategory = Prisma.BudgetGetPayload<{ include: { category: true } }>;

function utilization(spent: Prisma.Decimal, limit: Prisma.Decimal): number {
  if (limit.lessThanOrEqualTo(0)) {
    return 0;
  }
  return Number(spent.div(limit).mul(100).toDecimalPlaces(2).toString());
}

@Injectable()
export class BudgetsService {
  constructor(private readonly prisma: PrismaService) {}

  async createOrUpdate(
    workspaceId: string,
    baseCurrency: string,
    input: CreateBudgetInput,
    opts?: { replaceCategoryId?: string },
  ): Promise<BudgetView> {
    const anchor = input.periodStart ? new Date(input.periodStart.slice(0, 10)) : new Date();
    const { periodStart, periodEnd } = this.computePeriodBounds(input.period, anchor);

    const upsertArgs = {
      where: {
        workspaceId_categoryId_periodStart: { workspaceId, categoryId: input.categoryId, periodStart },
      },
      update: { amountLimit: input.amountLimit, period: input.period, periodEnd, isActive: true },
      create: {
        workspaceId,
        categoryId: input.categoryId,
        amountLimit: input.amountLimit,
        currency: baseCurrency,
        period: input.period,
        periodStart,
        periodEnd,
      },
      include: { category: true },
    } satisfies Prisma.BudgetUpsertArgs;

    // Re-categorization: the user is moving a budget from a placeholder category
    // (e.g. "Other") to the real one. Replace the old row instead of leaving a
    // duplicate, carrying any materialized spend over to the new category.
    const replaceCategoryId =
      opts?.replaceCategoryId && opts.replaceCategoryId !== input.categoryId
        ? opts.replaceCategoryId
        : null;

    if (!replaceCategoryId) {
      const budget = await this.prisma.budget.upsert(upsertArgs);
      return this.toView(budget);
    }

    const budget = await this.prisma.$transaction(async (tx) => {
      const stale = await tx.budget.findUnique({
        where: {
          workspaceId_categoryId_periodStart: {
            workspaceId,
            categoryId: replaceCategoryId,
            periodStart,
          },
        },
      });
      if (stale) {
        await tx.budget.delete({ where: { id: stale.id } });
      }

      const created = await tx.budget.upsert(upsertArgs);

      if (stale && stale.amountSpent.greaterThan(0)) {
        return tx.budget.update({
          where: { id: created.id },
          data: { amountSpent: { increment: stale.amountSpent } },
          include: { category: true },
        });
      }
      return created;
    });

    return this.toView(budget);
  }

  async list(workspaceId: string, query: ListBudgetsQuery): Promise<BudgetView[]> {
    const anchor = query.periodStart ? new Date(query.periodStart.slice(0, 10)) : new Date();
    const monthStart = this.computePeriodBounds('MONTHLY', anchor).periodStart;

    const budgets = await this.prisma.budget.findMany({
      where: {
        workspaceId,
        periodStart: { lte: anchor },
        periodEnd: { gte: monthStart },
      },
      orderBy: { periodStart: 'desc' },
      include: { category: true },
    });

    return budgets.map((b) => this.toView(b));
  }

  async update(
    workspaceId: string,
    budgetId: string,
    input: UpdateBudgetInput,
  ): Promise<BudgetView> {
    const existing = await this.prisma.budget.findFirst({ where: { id: budgetId, workspaceId } });
    if (!existing) {
      throw new NotFoundException('Budget not found.');
    }
    const budget = await this.prisma.budget.update({
      where: { id: budgetId },
      data: { amountLimit: input.amountLimit, isActive: input.isActive },
      include: { category: true },
    });
    return this.toView(budget);
  }

  /** Atomically adjust the materialized amountSpent of the budget covering a transaction. */
  async applyTransactionSpend(
    txc: Prisma.TransactionClient,
    params: {
      workspaceId: string;
      categoryId: string;
      transactionDate: Date;
      amountBase: string;
      sign: 1 | -1;
    },
  ): Promise<BudgetSpendChange | null> {
    const budget = await txc.budget.findFirst({
      where: {
        workspaceId: params.workspaceId,
        categoryId: params.categoryId,
        isActive: true,
        periodStart: { lte: params.transactionDate },
        periodEnd: { gte: params.transactionDate },
      },
      include: { category: true },
    });
    if (!budget) {
      return null;
    }

    const delta = new Prisma.Decimal(params.amountBase);
    const previousSpent = budget.amountSpent;
    const newSpent = params.sign === 1 ? previousSpent.add(delta) : previousSpent.sub(delta);

    await txc.budget.update({
      where: { id: budget.id },
      data: {
        amountSpent:
          params.sign === 1
            ? { increment: params.amountBase }
            : { decrement: params.amountBase },
      },
    });

    return {
      budgetId: budget.id,
      categoryName: budget.category.name,
      amountLimit: budget.amountLimit.toString(),
      previousSpent: previousSpent.toString(),
      newSpent: newSpent.toString(),
      previousPercent: utilization(previousSpent, budget.amountLimit),
      newPercent: utilization(newSpent, budget.amountLimit),
    };
  }

  computePeriodBounds(period: BudgetPeriodP3, start: Date): PeriodBounds {
    const y = start.getUTCFullYear();
    const m = start.getUTCMonth();
    const d = start.getUTCDate();

    switch (period) {
      case 'MONTHLY': {
        return {
          periodStart: new Date(Date.UTC(y, m, 1)),
          periodEnd: new Date(Date.UTC(y, m + 1, 1) - 1),
        };
      }
      case 'WEEKLY': {
        return {
          periodStart: new Date(Date.UTC(y, m, d)),
          periodEnd: new Date(Date.UTC(y, m, d + 7) - 1),
        };
      }
      case 'QUARTERLY': {
        const q = Math.floor(m / 3) * 3;
        return {
          periodStart: new Date(Date.UTC(y, q, 1)),
          periodEnd: new Date(Date.UTC(y, q + 3, 1) - 1),
        };
      }
      case 'ANNUAL': {
        return {
          periodStart: new Date(Date.UTC(y, 0, 1)),
          periodEnd: new Date(Date.UTC(y + 1, 0, 1) - 1),
        };
      }
    }
  }

  private toView(budget: BudgetWithCategory): BudgetView {
    return {
      id: budget.id,
      category: { id: budget.category.id, name: budget.category.name },
      amountLimit: budget.amountLimit.toString(),
      amountSpent: budget.amountSpent.toString(),
      currency: budget.currency,
      utilizationPercent: utilization(budget.amountSpent, budget.amountLimit),
      period: budget.period,
      periodStart: budget.periodStart.toISOString(),
      periodEnd: budget.periodEnd.toISOString(),
      isActive: budget.isActive,
    };
  }
}
