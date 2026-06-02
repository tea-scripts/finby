import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TIER_LIMITS, type SubscriptionTier } from '@budgy/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CategoryBreakdownResult,
  SummaryResult,
  TopMerchantsResult,
  TrendResult,
} from './analytics.types';

const CONFIRMED = 'CONFIRMED';

function sum(value: Prisma.Decimal | null | undefined): Prisma.Decimal {
  return value ?? new Prisma.Decimal(0);
}

function percent(part: Prisma.Decimal, whole: Prisma.Decimal): number {
  if (whole.lessThanOrEqualTo(0)) {
    return 0;
  }
  return Number(part.div(whole).mul(100).toDecimalPlaces(2).toString());
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(
    workspaceId: string,
    currency: string,
    from: string,
    to: string,
  ): Promise<SummaryResult> {
    const range = this.range(from, to);

    const [income, expense, transactionCount] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: { workspaceId, status: CONFIRMED, type: 'INCOME', transactionDate: range },
        _sum: { amountBase: true },
      }),
      this.prisma.transaction.aggregate({
        where: { workspaceId, status: CONFIRMED, type: 'EXPENSE', transactionDate: range },
        _sum: { amountBase: true },
      }),
      this.prisma.transaction.count({
        where: { workspaceId, status: CONFIRMED, transactionDate: range },
      }),
    ]);

    const totalIncome = sum(income._sum.amountBase);
    const totalExpenses = sum(expense._sum.amountBase);
    const netSavings = totalIncome.sub(totalExpenses);

    return {
      period: { from: from.slice(0, 10), to: to.slice(0, 10) },
      totalIncome: totalIncome.toString(),
      totalExpenses: totalExpenses.toString(),
      netSavings: netSavings.toString(),
      savingsRate: percent(netSavings, totalIncome),
      currency,
      transactionCount,
    };
  }

  async byCategory(
    workspaceId: string,
    currency: string,
    from: string,
    to: string,
    type: 'EXPENSE' | 'INCOME',
  ): Promise<CategoryBreakdownResult> {
    const range = this.range(from, to);

    const grouped = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { workspaceId, status: CONFIRMED, type, transactionDate: range },
      _sum: { amountBase: true },
      _count: true,
    });

    const ids = grouped.map((g) => g.categoryId).filter((id): id is string => id !== null);
    const categories = await this.prisma.category.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const nameById = new Map(categories.map((c) => [c.id, c.name]));

    const grandTotal = grouped.reduce(
      (acc, g) => acc.add(sum(g._sum.amountBase)),
      new Prisma.Decimal(0),
    );

    const breakdown = grouped
      .map((g) => {
        const total = sum(g._sum.amountBase);
        return {
          category: {
            id: g.categoryId ?? 'uncategorized',
            name: g.categoryId ? (nameById.get(g.categoryId) ?? 'Unknown') : 'Uncategorized',
          },
          total: total.toString(),
          percent: percent(total, grandTotal),
          transactionCount: g._count,
        };
      })
      .sort((a, b) => Number(b.total) - Number(a.total));

    return { breakdown, currency };
  }

  async trend(
    workspaceId: string,
    currency: string,
    months: number,
    tier: SubscriptionTier,
  ): Promise<TrendResult> {
    const cap = TIER_LIMITS[tier].analyticsTrendMonths;
    const effectiveMonths = cap === null ? months : Math.min(months, cap);

    const now = new Date();
    const points = [];
    for (let i = effectiveMonths - 1; i >= 0; i -= 1) {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1) - 1);
      const range = { gte: start, lte: end };

      const [income, expense] = await Promise.all([
        this.prisma.transaction.aggregate({
          where: { workspaceId, status: CONFIRMED, type: 'INCOME', transactionDate: range },
          _sum: { amountBase: true },
        }),
        this.prisma.transaction.aggregate({
          where: { workspaceId, status: CONFIRMED, type: 'EXPENSE', transactionDate: range },
          _sum: { amountBase: true },
        }),
      ]);

      const incomeTotal = sum(income._sum.amountBase);
      const expenseTotal = sum(expense._sum.amountBase);
      points.push({
        month: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`,
        income: incomeTotal.toString(),
        expenses: expenseTotal.toString(),
        savings: incomeTotal.sub(expenseTotal).toString(),
      });
    }

    return { trend: points, currency };
  }

  async topMerchants(
    workspaceId: string,
    currency: string,
    from: string,
    to: string,
    limit: number,
  ): Promise<TopMerchantsResult> {
    const range = this.range(from, to);

    const grouped = await this.prisma.transaction.groupBy({
      by: ['merchant'],
      where: {
        workspaceId,
        status: CONFIRMED,
        type: 'EXPENSE',
        merchant: { not: null },
        transactionDate: range,
      },
      _sum: { amountBase: true },
      _count: true,
    });

    const merchants = grouped
      .map((g) => ({
        merchant: g.merchant ?? 'Unknown',
        total: sum(g._sum.amountBase).toString(),
        transactionCount: g._count,
      }))
      .sort((a, b) => Number(b.total) - Number(a.total))
      .slice(0, limit);

    return { merchants, currency };
  }

  private range(from: string, to: string): Prisma.DateTimeFilter {
    return { gte: new Date(from.slice(0, 10)), lte: new Date(`${to.slice(0, 10)}T23:59:59.999Z`) };
  }
}
