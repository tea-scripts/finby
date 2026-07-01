import { Injectable } from '@nestjs/common';
import type { InsightResult } from '@finby/shared';
import { AnalyticsService } from './analytics.service';

const iso = (d: Date): string => d.toISOString().slice(0, 10);

@Injectable()
export class InsightService {
  constructor(private readonly analytics: AnalyticsService) {}

  async insight(
    workspaceId: string,
    currency: string,
    from: string,
    to: string,
    now: Date = new Date(),
  ): Promise<InsightResult> {
    const fromDate = new Date(`${from.slice(0, 10)}T00:00:00.000Z`);
    const y = fromDate.getUTCFullYear();
    const m = fromDate.getUTCMonth();

    const periodStart = new Date(Date.UTC(y, m, 1));
    const periodEnd = new Date(Date.UTC(y, m + 1, 0)); // last day of the viewed month
    const prevStart = new Date(Date.UTC(y, m - 1, 1));
    const prevEnd = new Date(Date.UTC(y, m, 0)); // last day of the prior month

    const isCurrentMonth = y === now.getUTCFullYear() && m === now.getUTCMonth();
    const periodTo = isCurrentMonth ? iso(now) : iso(periodEnd);

    const [cur, prev] = await Promise.all([
      this.analytics.summary(workspaceId, currency, iso(periodStart), periodTo),
      this.analytics.summary(workspaceId, currency, iso(prevStart), iso(prevEnd)),
    ]);

    const curSpend = Number(cur.totalExpenses);
    const prevSpend = Number(prev.totalExpenses);

    let projectedSpend: number | null = null;
    let projectedSavings: number | null = null;
    let comparisonSpend = curSpend;

    if (isCurrentMonth) {
      const daysElapsed = Math.max(1, now.getUTCDate());
      const daysInMonth = periodEnd.getUTCDate();
      const factor = daysInMonth / daysElapsed;
      projectedSpend = curSpend * factor;
      projectedSavings = Number(cur.netSavings) * factor;
      comparisonSpend = projectedSpend;
    }

    const hasPrev = prev.transactionCount > 0 && prevSpend > 0;
    let direction: 'less' | 'more' | 'flat' = 'flat';
    let spendDeltaPercent = 0;
    if (hasPrev) {
      const deltaPct = ((comparisonSpend - prevSpend) / prevSpend) * 100;
      spendDeltaPercent = Math.round(Math.abs(deltaPct));
      direction = deltaPct < -0.5 ? 'less' : deltaPct > 0.5 ? 'more' : 'flat';
    }

    const round2 = (n: number): string => n.toFixed(2);
    return {
      period: { from: iso(periodStart), to: periodTo },
      currency,
      direction,
      spendDeltaPercent,
      projectionApplies: isCurrentMonth,
      projectedSpend: projectedSpend === null ? null : round2(projectedSpend),
      projectedSavings: projectedSavings === null ? null : round2(projectedSavings),
      comparedTo: { from: iso(prevStart), to: iso(prevEnd) },
      message: buildMessage({
        hasPrev,
        direction,
        spendDeltaPercent,
        isCurrentMonth,
        projectedSavings,
        currency,
      }),
    };
  }
}

function buildMessage(p: {
  hasPrev: boolean;
  direction: 'less' | 'more' | 'flat';
  spendDeltaPercent: number;
  isCurrentMonth: boolean;
  projectedSavings: number | null;
  currency: string;
}): string {
  if (!p.hasPrev) return 'Not enough history yet to compare to last month.';

  const cmp = p.isCurrentMonth ? 'last month' : 'the month before';

  let msg: string;
  if (p.direction === 'flat') {
    if (p.isCurrentMonth) {
      msg = `You're spending about the same as ${cmp}.`;
    } else {
      msg = `You spent about the same as ${cmp}.`;
    }
  } else {
    const dir = p.direction === 'less' ? 'less' : 'more';
    if (p.isCurrentMonth) {
      msg = `You're on pace to spend ${p.spendDeltaPercent}% ${dir} than ${cmp}.`;
    } else {
      msg = `You spent ${p.spendDeltaPercent}% ${dir} than ${cmp}.`;
    }
  }

  if (p.isCurrentMonth && p.projectedSavings !== null && p.projectedSavings > 0) {
    const amount = Math.round(p.projectedSavings).toLocaleString('en-US');
    msg += ` At this rate you'll save ${p.currency} ${amount} this month.`;
  }
  return msg;
}
