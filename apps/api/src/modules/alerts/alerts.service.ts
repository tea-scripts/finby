import { Injectable, NotFoundException } from '@nestjs/common';
import type { Alert } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { BudgetSpendChange } from '../budgets/budgets.types';
import type { ListAlertsQuery, UpdateAlertInput } from './dto/alerts.schemas';
import type { AlertListResult, AlertView, BudgetAlertType } from './alerts.types';

/** Which budget threshold (if any) was newly crossed upward. */
export function crossedBudgetThreshold(prev: number, next: number): BudgetAlertType | null {
  if (prev < 100 && next >= 100) return 'BUDGET_EXCEEDED';
  if (prev < 90 && next >= 90) return 'BUDGET_90_PERCENT';
  if (prev < 75 && next >= 75) return 'BUDGET_75_PERCENT';
  return null;
}

function alertCopy(
  type: BudgetAlertType,
  change: BudgetSpendChange,
  currency: string,
): { title: string; body: string } {
  const pct = Math.round(change.newPercent);
  const spent = `${change.newSpent} ${currency}`.trim();
  const limit = `${change.amountLimit} ${currency}`.trim();
  switch (type) {
    case 'BUDGET_75_PERCENT':
      return {
        title: `${change.categoryName} budget at 75%`,
        body: `You've spent ${spent} of your ${limit} ${change.categoryName} budget this period (${pct}%).`,
      };
    case 'BUDGET_90_PERCENT':
      return {
        title: `${change.categoryName} budget at 90%`,
        body: `Heads up — ${spent} of your ${limit} ${change.categoryName} budget is used (${pct}%). Easy does it.`,
      };
    case 'BUDGET_EXCEEDED':
      return {
        title: `${change.categoryName} budget exceeded`,
        body: `You've gone over your ${change.categoryName} budget: ${spent} against a ${limit} limit (${pct}%).`,
      };
  }
}

function toView(alert: Alert): AlertView {
  return {
    id: alert.id,
    type: alert.type,
    status: alert.status,
    title: alert.title,
    body: alert.body,
    createdAt: alert.createdAt.toISOString(),
  };
}

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async generateBudgetAlert(params: {
    workspaceId: string;
    userId: string;
    budgetId: string;
    categoryId?: string | null;
    currency?: string;
    change: BudgetSpendChange;
  }): Promise<AlertView | null> {
    const type = crossedBudgetThreshold(params.change.previousPercent, params.change.newPercent);
    if (!type) {
      return null;
    }

    const { title, body } = alertCopy(type, params.change, params.currency ?? '');
    const alert = await this.prisma.alert.create({
      data: {
        workspaceId: params.workspaceId,
        userId: params.userId,
        type,
        title,
        body,
        budgetId: params.budgetId,
        categoryId: params.categoryId ?? null,
        metadata: JSON.stringify({
          utilization: params.change.newPercent,
          limit: params.change.amountLimit,
          spent: params.change.newSpent,
        }),
      },
    });
    return toView(alert);
  }

  async list(
    workspaceId: string,
    userId: string,
    query: ListAlertsQuery,
  ): Promise<AlertListResult> {
    const where = {
      workspaceId,
      userId,
      ...(query.status ? { status: query.status } : {}),
    };

    const rows = await this.prisma.alert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);

    const unreadCount = await this.prisma.alert.count({
      where: { workspaceId, userId, status: 'UNREAD' },
    });

    return {
      alerts: page.map(toView),
      unreadCount,
      nextCursor: hasMore && last ? last.id : null,
      hasMore,
    };
  }

  async updateStatus(
    workspaceId: string,
    userId: string,
    alertId: string,
    input: UpdateAlertInput,
  ): Promise<AlertView> {
    const existing = await this.prisma.alert.findFirst({
      where: { id: alertId, workspaceId, userId },
    });
    if (!existing) {
      throw new NotFoundException('Alert not found.');
    }

    const now = new Date();
    const alert = await this.prisma.alert.update({
      where: { id: alertId },
      data: {
        status: input.status,
        ...(input.status === 'READ' ? { readAt: now } : { dismissedAt: now }),
      },
    });
    return toView(alert);
  }

  async markAllRead(workspaceId: string, userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.alert.updateMany({
      where: { workspaceId, userId, status: 'UNREAD' },
      data: { status: 'READ', readAt: new Date() },
    });
    return { updated: result.count };
  }
}
