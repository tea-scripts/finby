import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { FinancialIntelligenceService } from '../analytics/financial-intelligence.service';
import { AlertsService } from '../alerts/alerts.service';
import { PushService } from '../push/push.service';
import type { FinancialIntelligenceSignals } from '../llm/llm.types';

type InsightAlertType = 'AI_COACHING_NUDGE' | 'UNUSUAL_SPEND' | 'MONTHLY_SUMMARY';

interface WorkspaceRow {
  id: string;
  baseCurrency: string;
  tier: string;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** UTC YYYY-MM-DD — AnalyticsService methods take ISO date strings. */
function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Nightly proactive-insight engine. Computes financial signals per workspace,
 * persists Alert records for anomalies / burn-rate / monthly summaries, and
 * fans push notifications out to workspace members. The proactive layer: Finby
 * surfaces insights without the user having to ask.
 */
@Injectable()
export class InsightComputationService {
  private readonly logger = new Logger(InsightComputationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly financialIntelligence: FinancialIntelligenceService,
    private readonly alerts: AlertsService,
    private readonly push: PushService,
    private readonly analytics: AnalyticsService,
  ) {}

  @Cron('0 6 * * *') // 6AM UTC daily
  async runNightlyJob(): Promise<void> {
    try {
      await this.processAllWorkspaces();
    } catch (err) {
      this.logger.error(`Nightly insight job failed: ${describe(err)}`);
    }
  }

  /** Iterate every workspace sequentially (for...of, not Promise.all — keeps DB
   *  and push load bounded). One workspace's failure never aborts the rest. */
  async processAllWorkspaces(now: Date = new Date()): Promise<void> {
    const workspaces = await this.prisma.workspace.findMany({
      select: { id: true, baseCurrency: true, tier: true },
    });

    for (const workspace of workspaces) {
      try {
        await this.processWorkspace(workspace, now);
      } catch (err) {
        this.logger.error(`Insight job failed for workspace ${workspace.id}: ${describe(err)}`);
      }
    }
  }

  private async processWorkspace(workspace: WorkspaceRow, now: Date): Promise<void> {
    const signals = await this.financialIntelligence.computeSignals(
      workspace.id,
      workspace.baseCurrency,
      workspace.tier,
    );

    const { allMemberUserIds, notifiableUserIds } = await this.resolveAudience(workspace.id);

    await this.emitAnomalyInsights(workspace, signals, allMemberUserIds, notifiableUserIds, now);
    await this.emitBurnRateInsights(workspace, signals, allMemberUserIds, notifiableUserIds, now);

    // Monthly summary fires only on the 1st (the month has just turned over).
    if (now.getUTCDate() === 1) {
      await this.emitMonthlySummary(workspace, allMemberUserIds, notifiableUserIds, now);
    }
  }

  /** Resolve the workspace audience: every accepted member (alert recipients) and
   *  the subset that has a push subscription (push recipients). */
  private async resolveAudience(
    workspaceId: string,
  ): Promise<{ allMemberUserIds: string[]; notifiableUserIds: string[] }> {
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId, acceptedAt: { not: null } },
      select: { userId: true },
    });
    const allMemberUserIds = members.map((m) => m.userId);
    if (allMemberUserIds.length === 0) {
      return { allMemberUserIds: [], notifiableUserIds: [] };
    }

    const pushUsers = await this.prisma.pushSubscription.findMany({
      where: { workspaceId, userId: { in: allMemberUserIds } },
      distinct: ['userId'],
      select: { userId: true },
    });
    return { allMemberUserIds, notifiableUserIds: pushUsers.map((p) => p.userId) };
  }

  private async emitAnomalyInsights(
    workspace: WorkspaceRow,
    signals: FinancialIntelligenceSignals,
    allMemberUserIds: string[],
    notifiableUserIds: string[],
    now: Date,
  ): Promise<void> {
    if (signals.spendingAnomalies.length === 0) return;
    const anomaly = signals.spendingAnomalies[0]; // sorted desc by multiplier
    if (!anomaly) return;

    if (await this.alreadyAlertedToday(workspace.id, 'UNUSUAL_SPEND', now)) return;

    const body = `${anomaly.category} is ${anomaly.multiplier}× your usual spend this month`;
    await this.fanOut(workspace.id, allMemberUserIds, notifiableUserIds, {
      type: 'UNUSUAL_SPEND',
      title: '⚠️ Spending spike detected',
      body,
      pushTitle: '⚠️ Spending spike detected',
      pushBody: body,
      url: '/chat',
      metadata: {
        category: anomaly.category,
        multiplier: anomaly.multiplier,
        currentMonthAmount: anomaly.currentMonthAmount,
        threeMonthAverage: anomaly.threeMonthAverage,
      },
    });
  }

  private async emitBurnRateInsights(
    workspace: WorkspaceRow,
    signals: FinancialIntelligenceSignals,
    allMemberUserIds: string[],
    notifiableUserIds: string[],
    now: Date,
  ): Promise<void> {
    const exceeding = signals.burnRateForecasts.filter((f) => f.willExceed === true);
    if (exceeding.length === 0) return;

    if (await this.alreadyAlertedToday(workspace.id, 'AI_COACHING_NUDGE', now)) return;

    const forecast = [...exceeding].sort((a, b) => b.percentProjected - a.percentProjected)[0];
    if (!forecast) return;

    const body = `${forecast.category} budget on track to exceed by month-end (${Math.round(
      forecast.percentProjected,
    )}% projected)`;
    await this.fanOut(workspace.id, allMemberUserIds, notifiableUserIds, {
      type: 'AI_COACHING_NUDGE',
      title: `💸 ${forecast.category} budget at risk`,
      body,
      pushTitle: '💸 Budget at risk',
      pushBody: body,
      url: '/chat',
      metadata: {
        category: forecast.category,
        budgetLimit: forecast.budgetLimit,
        projectedMonthEnd: forecast.projectedMonthEnd,
        percentProjected: forecast.percentProjected,
        daysRemaining: forecast.daysRemaining,
      },
    });
  }

  private async emitMonthlySummary(
    workspace: WorkspaceRow,
    allMemberUserIds: string[],
    notifiableUserIds: string[],
    now: Date,
  ): Promise<void> {
    // Dedup across the whole calendar month, not just today.
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const existing = await this.prisma.alert.findFirst({
      where: {
        workspaceId: workspace.id,
        type: 'MONTHLY_SUMMARY',
        createdAt: { gte: startOfMonth },
      },
    });
    if (existing) return;

    // Last month's range — signals.currentMonthSummary is ~empty on the 1st, so
    // pull the just-ended month directly from AnalyticsService.
    const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const lastMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    const summary = await this.analytics.summary(
      workspace.id,
      workspace.baseCurrency,
      ymd(lastMonthStart),
      ymd(lastMonthEnd),
    );

    const monthName = MONTHS[lastMonthStart.getUTCMonth()] ?? '';
    const currency = workspace.baseCurrency;
    const body = `Income: ${currency} ${summary.totalIncome} | Expenses: ${currency} ${summary.totalExpenses} | Saved: ${currency} ${summary.netSavings} (${summary.savingsRate}%)`;

    await this.fanOut(workspace.id, allMemberUserIds, notifiableUserIds, {
      type: 'MONTHLY_SUMMARY',
      title: `Your ${monthName} financial summary`,
      body,
      pushTitle: `Your ${monthName} financial summary`,
      pushBody: body,
      url: '/dashboard',
      metadata: {
        income: summary.totalIncome,
        expenses: summary.totalExpenses,
        savings: summary.netSavings,
        savingsRate: summary.savingsRate,
      },
    });
  }

  /** Has an alert of this type already been created today for this workspace? */
  private async alreadyAlertedToday(
    workspaceId: string,
    type: InsightAlertType,
    now: Date,
  ): Promise<boolean> {
    const startOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const existing = await this.prisma.alert.findFirst({
      where: { workspaceId, type, createdAt: { gte: startOfToday } },
    });
    return existing !== null;
  }

  /** Persist an alert for every accepted member, then best-effort push only to
   *  members with a registered device. Push is wrapped so a delivery failure
   *  never aborts the fan-out or the workspace loop. */
  private async fanOut(
    workspaceId: string,
    alertUserIds: string[],
    pushUserIds: string[],
    insight: {
      type: InsightAlertType;
      title: string;
      body: string;
      pushTitle: string;
      pushBody: string;
      url: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    // Alerts: all accepted members, regardless of push-subscription status.
    for (const userId of alertUserIds) {
      await this.alerts.createInsightAlert({
        workspaceId,
        userId,
        type: insight.type,
        title: insight.title,
        body: insight.body,
        metadata: insight.metadata,
      });
    }

    // Push: only members with a registered device.
    for (const userId of pushUserIds) {
      try {
        await this.push.sendToUser(workspaceId, userId, {
          title: insight.pushTitle,
          body: insight.pushBody,
          url: insight.url,
        });
      } catch (err) {
        this.logger.warn(`Push failed for user ${userId} in workspace ${workspaceId}: ${describe(err)}`);
      }
    }
  }
}
