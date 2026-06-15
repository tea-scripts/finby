import { Injectable, Logger } from '@nestjs/common';
import { AnalyticsService } from '../../analytics/analytics.service';
import { BudgetsService } from '../../budgets/budgets.service';
import type {
  BurnRateForecast,
  FinancialIntelligenceSignals,
  SpendingAnomaly,
} from '../../llm/llm.types';

/** Safe fallback — a signals failure must never break a chat turn. */
const EMPTY_SIGNALS: FinancialIntelligenceSignals = {
  spendingAnomalies: [],
  burnRateForecasts: [],
  savingsVelocityDelta: null,
  topMerchants: [],
  currentMonthSummary: { totalIncome: 0, totalExpenses: 0, netSavings: 0, savingsRate: 0 },
};

const ANOMALY_THRESHOLD = 1.5;
const BURN_RATE_AT_RISK_PERCENT = 80;
const MAX_ANOMALIES = 5;
const MAX_MERCHANTS = 5;

/** UTC YYYY-MM-DD — analytics methods take ISO date strings and slice(0, 10). */
function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class FinancialIntelligenceService {
  private readonly logger = new Logger(FinancialIntelligenceService.name);

  constructor(
    private readonly analytics: AnalyticsService,
    private readonly budgets: BudgetsService,
  ) {}

  /** Computes the financial signals block for a workspace. Never throws — on any
   *  failure it logs and returns empty defaults so chat continues unaffected. */
  async computeSignals(
    workspaceId: string,
    baseCurrency: string,
    tier: string,
  ): Promise<FinancialIntelligenceSignals> {
    // Reserved for future tier gating of signal depth; referenced so strict
    // TS (noUnusedParameters) is satisfied without altering the contract.
    void tier;

    try {
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth();

      const currentMonthStart = ymd(new Date(Date.UTC(year, month, 1)));
      const currentMonthEnd = ymd(new Date(Date.UTC(year, month + 1, 0)));
      const threeMonthsAgo = ymd(new Date(Date.UTC(year, month - 3, 1)));
      const lastMonthStart = ymd(new Date(Date.UTC(year, month - 1, 1)));
      const lastMonthEnd = ymd(new Date(Date.UTC(year, month, 0)));
      const thirtyDaysAgo = ymd(new Date(Date.UTC(year, month, now.getUTCDate() - 30)));
      const todayStr = ymd(now);

      const [
        currentSummary,
        lastMonthSummary,
        currentByCategory,
        threeMonthByCategory,
        merchants,
        activeBudgets,
      ] = await Promise.all([
        this.analytics.summary(workspaceId, baseCurrency, currentMonthStart, currentMonthEnd),
        this.analytics.summary(workspaceId, baseCurrency, lastMonthStart, lastMonthEnd),
        this.analytics.byCategory(
          workspaceId,
          baseCurrency,
          currentMonthStart,
          currentMonthEnd,
          'EXPENSE',
        ),
        this.analytics.byCategory(
          workspaceId,
          baseCurrency,
          threeMonthsAgo,
          lastMonthEnd,
          'EXPENSE',
        ),
        this.analytics.topMerchants(workspaceId, baseCurrency, thirtyDaysAgo, todayStr, MAX_MERCHANTS),
        this.budgets.list(workspaceId, {}),
      ]);

      const spendingAnomalies = this.detectAnomalies(currentByCategory, threeMonthByCategory);
      const burnRateForecasts = this.forecastBurnRates(activeBudgets, now);
      const savingsVelocityDelta = this.savingsVelocity(currentSummary, lastMonthSummary);

      const topMerchants = merchants.merchants.slice(0, MAX_MERCHANTS).map((m) => ({
        name: m.merchant,
        total: Number(m.total),
        visits: m.transactionCount,
      }));

      return {
        spendingAnomalies,
        burnRateForecasts,
        savingsVelocityDelta,
        topMerchants,
        currentMonthSummary: {
          totalIncome: Number(currentSummary.totalIncome),
          totalExpenses: Number(currentSummary.totalExpenses),
          netSavings: Number(currentSummary.netSavings),
          savingsRate: currentSummary.savingsRate,
        },
      };
    } catch (error) {
      this.logger.error(
        `computeSignals failed for workspace ${workspaceId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return EMPTY_SIGNALS;
    }
  }

  /** Flags categories spending >= 1.5x their three-month average, top 5 by multiplier. */
  private detectAnomalies(
    current: Awaited<ReturnType<AnalyticsService['byCategory']>>,
    threeMonth: Awaited<ReturnType<AnalyticsService['byCategory']>>,
  ): SpendingAnomaly[] {
    const averageByCategory = new Map<string, number>();
    for (const item of threeMonth.breakdown) {
      averageByCategory.set(item.category.name, Number(item.total) / 3);
    }

    const anomalies: SpendingAnomaly[] = [];
    for (const item of current.breakdown) {
      const currentAmount = Number(item.total);
      const threeMonthAverage = averageByCategory.get(item.category.name) ?? 0;
      if (threeMonthAverage === 0) continue; // no history to compare against

      const multiplier = currentAmount / threeMonthAverage;
      if (multiplier >= ANOMALY_THRESHOLD) {
        anomalies.push({
          category: item.category.name,
          currentMonthAmount: currentAmount,
          threeMonthAverage: round2(threeMonthAverage),
          multiplier: round1(multiplier),
        });
      }
    }

    return anomalies.sort((a, b) => b.multiplier - a.multiplier).slice(0, MAX_ANOMALIES);
  }

  /** Projects active-budget spend to month-end via a simple daily-rate run-rate. */
  private forecastBurnRates(
    budgets: Awaited<ReturnType<BudgetsService['list']>>,
    now: Date,
  ): BurnRateForecast[] {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const daysElapsed = now.getUTCDate();
    const daysRemaining = daysInMonth - daysElapsed;
    if (daysElapsed <= 0) return [];

    const forecasts: BurnRateForecast[] = [];
    for (const budget of budgets) {
      if (!budget.isActive) continue;
      const budgetLimit = Number(budget.amountLimit);
      const spent = Number(budget.amountSpent);
      if (!(budgetLimit > 0)) continue;

      const dailyRate = spent / daysElapsed;
      const projectedMonthEnd = dailyRate * daysInMonth;
      const percentProjected = round1((projectedMonthEnd / budgetLimit) * 100);
      const willExceed = projectedMonthEnd > budgetLimit;

      if (willExceed || percentProjected > BURN_RATE_AT_RISK_PERCENT) {
        forecasts.push({
          category: budget.category.name,
          budgetLimit,
          projectedMonthEnd: round2(projectedMonthEnd),
          daysRemaining,
          willExceed,
          percentProjected,
        });
      }
    }

    return forecasts.sort((a, b) => b.percentProjected - a.percentProjected);
  }

  /** Change in savings rate (percentage points) vs last month; null if either
   *  month had zero income (the rate would be a meaningless 0). */
  private savingsVelocity(
    current: Awaited<ReturnType<AnalyticsService['summary']>>,
    lastMonth: Awaited<ReturnType<AnalyticsService['summary']>>,
  ): number | null {
    if (Number(current.totalIncome) <= 0 || Number(lastMonth.totalIncome) <= 0) {
      return null;
    }
    return round1(current.savingsRate - lastMonth.savingsRate);
  }
}
