import { PrismaService } from '../../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { FinancialIntelligenceService } from '../analytics/financial-intelligence.service';
import { AlertsService } from '../alerts/alerts.service';
import { PushService } from '../push/push.service';
import { LlmService } from '../llm/llm.service';
import type { FinancialIntelligenceSignals } from '../llm/llm.types';
import { InsightComputationService } from './insights-computation.service';

// PREMIUM has proactiveCoaching: true, so it passes the tier gate.
const WORKSPACE = { id: 'w1', baseCurrency: 'USD', tier: 'PREMIUM' };

function emptySignals(over: Partial<FinancialIntelligenceSignals> = {}): FinancialIntelligenceSignals {
  return {
    spendingAnomalies: [],
    burnRateForecasts: [],
    savingsVelocityDelta: null,
    topMerchants: [],
    currentMonthSummary: { totalIncome: 0, totalExpenses: 0, netSavings: 0, savingsRate: 0 },
    ...over,
  };
}

const ANOMALY = {
  category: 'Dining',
  currentMonthAmount: 8200,
  threeMonthAverage: 3900,
  observedMonths: 3,
  multiplier: 2.1,
};

const WILL_EXCEED_FORECAST = {
  category: 'Groceries',
  budgetLimit: 10000,
  projectedMonthEnd: 12400,
  daysRemaining: 10,
  willExceed: true,
  percentProjected: 124,
};

function summaryVal() {
  return {
    period: { from: '2026-05-01', to: '2026-05-31' },
    totalIncome: '45000',
    totalExpenses: '36800',
    netSavings: '8200',
    savingsRate: 18.2,
    currency: 'USD',
    transactionCount: 40,
  };
}

function makeService(
  opts: { workspaces?: typeof WORKSPACE[]; memberUserIds?: string[]; pushUserIds?: string[] } = {},
) {
  const workspaces = opts.workspaces ?? [WORKSPACE];
  const pushUserIds = opts.pushUserIds ?? ['u1'];
  // Accepted members default to the push set, but can be set independently so a
  // member-without-a-device scenario is expressible.
  const memberUserIds = opts.memberUserIds ?? pushUserIds;

  const prisma = {
    workspace: { findMany: jest.fn().mockResolvedValue(workspaces) },
    workspaceMember: {
      findMany: jest.fn().mockResolvedValue(memberUserIds.map((userId) => ({ userId }))),
    },
    pushSubscription: {
      findMany: jest.fn().mockResolvedValue(pushUserIds.map((userId) => ({ userId }))),
    },
    alert: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const financialIntelligence = { computeSignals: jest.fn().mockResolvedValue(emptySignals()) };
  const alerts = { createInsightAlert: jest.fn().mockResolvedValue(undefined) };
  const push = { sendToUser: jest.fn().mockResolvedValue(undefined) };
  const analytics = { summary: jest.fn().mockResolvedValue(summaryVal()) };
  // Default to rejecting so emitters use the deterministic fallback copy — keeps
  // the content assertions below stable. Specific LLM-path tests override this.
  const llm = { createMessage: jest.fn().mockRejectedValue(new Error('no-llm-in-test')) };

  const service = new InsightComputationService(
    prisma as unknown as PrismaService,
    financialIntelligence as unknown as FinancialIntelligenceService,
    alerts as unknown as AlertsService,
    push as unknown as PushService,
    analytics as unknown as AnalyticsService,
    llm as unknown as LlmService,
  );
  return { service, prisma, financialIntelligence, alerts, push, analytics, llm };
}

// A mid-month date so the monthly-summary branch is dormant unless tested.
const MID_MONTH = new Date('2026-06-15T06:00:00Z');
const FIRST_OF_MONTH = new Date('2026-06-01T06:00:00Z');

describe('InsightComputationService — anomalies', () => {
  it('creates an UNUSUAL_SPEND alert and sends push when an anomaly is detected', async () => {
    const { service, financialIntelligence, alerts, push } = makeService();
    financialIntelligence.computeSignals.mockResolvedValue(
      emptySignals({ spendingAnomalies: [ANOMALY] }),
    );

    await service.processAllWorkspaces(MID_MONTH);

    expect(alerts.createInsightAlert).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'w1', userId: 'u1', type: 'UNUSUAL_SPEND' }),
    );
    expect(push.sendToUser).toHaveBeenCalledWith(
      'w1',
      'u1',
      expect.objectContaining({ url: '/chat', body: expect.stringContaining('Dining') }),
    );
  });

  it('does not create an alert when there are no anomalies', async () => {
    const { service, alerts, push } = makeService();
    // default signals are empty

    await service.processAllWorkspaces(MID_MONTH);

    expect(alerts.createInsightAlert).not.toHaveBeenCalled();
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('skips creation when an UNUSUAL_SPEND alert already exists today (dedup)', async () => {
    const { service, prisma, financialIntelligence, alerts, push } = makeService();
    financialIntelligence.computeSignals.mockResolvedValue(
      emptySignals({ spendingAnomalies: [ANOMALY] }),
    );
    prisma.alert.findFirst.mockResolvedValue({ id: 'existing' });

    await service.processAllWorkspaces(MID_MONTH);

    expect(alerts.createInsightAlert).not.toHaveBeenCalled();
    expect(push.sendToUser).not.toHaveBeenCalled();
  });
});

describe('InsightComputationService — burn rate', () => {
  it('alerts + pushes when a budget is forecast to exceed', async () => {
    const { service, financialIntelligence, alerts, push } = makeService();
    financialIntelligence.computeSignals.mockResolvedValue(
      emptySignals({ burnRateForecasts: [WILL_EXCEED_FORECAST] }),
    );

    await service.processAllWorkspaces(MID_MONTH);

    expect(alerts.createInsightAlert).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'w1', userId: 'u1', type: 'AI_COACHING_NUDGE' }),
    );
    expect(push.sendToUser).toHaveBeenCalledWith(
      'w1',
      'u1',
      expect.objectContaining({ body: expect.stringContaining('on track to exceed') }),
    );
  });

  it('ignores forecasts that are not flagged willExceed', async () => {
    const { service, financialIntelligence, alerts } = makeService();
    financialIntelligence.computeSignals.mockResolvedValue(
      emptySignals({
        burnRateForecasts: [{ ...WILL_EXCEED_FORECAST, willExceed: false, percentProjected: 85 }],
      }),
    );

    await service.processAllWorkspaces(MID_MONTH);

    expect(alerts.createInsightAlert).not.toHaveBeenCalled();
  });
});

describe('InsightComputationService — monthly summary', () => {
  it('emits a MONTHLY_SUMMARY only on the 1st of the month', async () => {
    const { service, analytics, alerts } = makeService();

    await service.processAllWorkspaces(FIRST_OF_MONTH);

    expect(analytics.summary).toHaveBeenCalledTimes(1);
    expect(alerts.createInsightAlert).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'MONTHLY_SUMMARY', title: expect.stringContaining('May') }),
    );
  });

  it('does not emit a monthly summary mid-month', async () => {
    const { service, analytics, alerts } = makeService();

    await service.processAllWorkspaces(MID_MONTH);

    expect(analytics.summary).not.toHaveBeenCalled();
    expect(alerts.createInsightAlert).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'MONTHLY_SUMMARY' }),
    );
  });
});

describe('InsightComputationService — resilience & fan-out', () => {
  it('continues to the next workspace when one workspace throws', async () => {
    const { service, financialIntelligence, alerts } = makeService({
      workspaces: [WORKSPACE, { id: 'w2', baseCurrency: 'USD', tier: 'PREMIUM' }],
    });
    financialIntelligence.computeSignals.mockImplementation((workspaceId: string) =>
      workspaceId === 'w1'
        ? Promise.reject(new Error('boom'))
        : Promise.resolve(emptySignals({ spendingAnomalies: [ANOMALY] })),
    );

    await service.processAllWorkspaces(MID_MONTH);

    expect(financialIntelligence.computeSignals).toHaveBeenCalledTimes(2);
    expect(alerts.createInsightAlert).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'w2', type: 'UNUSUAL_SPEND' }),
    );
  });

  it('never sends push when there are no notifiable subscribers', async () => {
    const { service, financialIntelligence, push } = makeService({ pushUserIds: [] });
    financialIntelligence.computeSignals.mockResolvedValue(
      emptySignals({ spendingAnomalies: [ANOMALY] }),
    );

    await service.processAllWorkspaces(MID_MONTH);

    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('creates an alert for a member without a push subscription', async () => {
    // Accepted member u1 exists but has no registered device.
    const { service, financialIntelligence, alerts, push } = makeService({
      memberUserIds: ['u1'],
      pushUserIds: [],
    });
    financialIntelligence.computeSignals.mockResolvedValue(
      emptySignals({ spendingAnomalies: [ANOMALY] }),
    );

    await service.processAllWorkspaces(MID_MONTH);

    expect(alerts.createInsightAlert).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'w1', userId: 'u1', type: 'UNUSUAL_SPEND' }),
    );
    expect(push.sendToUser).not.toHaveBeenCalled();
  });
});

describe('InsightComputationService — tier gating', () => {
  it('skips a workspace whose tier has proactiveCoaching disabled', async () => {
    const { service, financialIntelligence, alerts } = makeService({
      workspaces: [{ id: 'w1', baseCurrency: 'USD', tier: 'FREE' }],
    });
    financialIntelligence.computeSignals.mockResolvedValue(
      emptySignals({ spendingAnomalies: [ANOMALY] }),
    );

    await service.processAllWorkspaces(MID_MONTH);

    // Gate short-circuits before computing signals or creating alerts.
    expect(financialIntelligence.computeSignals).not.toHaveBeenCalled();
    expect(alerts.createInsightAlert).not.toHaveBeenCalled();
  });

  it('processes a workspace whose tier has proactiveCoaching enabled', async () => {
    const { service, financialIntelligence, alerts } = makeService({
      workspaces: [{ id: 'w1', baseCurrency: 'USD', tier: 'PREMIUM' }],
    });
    financialIntelligence.computeSignals.mockResolvedValue(
      emptySignals({ spendingAnomalies: [ANOMALY] }),
    );

    await service.processAllWorkspaces(MID_MONTH);

    expect(financialIntelligence.computeSignals).toHaveBeenCalledTimes(1);
    expect(alerts.createInsightAlert).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'UNUSUAL_SPEND' }),
    );
  });
});

describe('InsightComputationService — generateInsightCopy (LLM + fallback)', () => {
  type GenFn = (
    type: 'UNUSUAL_SPEND' | 'AI_COACHING_NUDGE' | 'MONTHLY_SUMMARY',
    data: Record<string, unknown>,
    baseCurrency: string,
  ) => Promise<{ title: string; body: string }>;

  function gen(service: InsightComputationService): GenFn {
    return (service as unknown as { generateInsightCopy: GenFn }).generateInsightCopy.bind(service);
  }

  it('returns the parsed title/body when the LLM responds with valid JSON', async () => {
    const { service, llm } = makeService();
    llm.createMessage.mockResolvedValue({ textOutput: '{"title":"Nice work","body":"You did great"}' });

    const result = await gen(service)('UNUSUAL_SPEND', { category: 'Dining', multiplier: 2 }, 'USD');

    expect(result).toEqual({ title: 'Nice work', body: 'You did great' });
  });

  it('falls back to template copy on malformed JSON — never throws', async () => {
    const { service, llm } = makeService();
    llm.createMessage.mockResolvedValue({ textOutput: 'not valid json {{{' });

    const result = await gen(service)('UNUSUAL_SPEND', { category: 'Dining', multiplier: 2.1 }, 'USD');

    expect(result.title).toBe('⚠️ Spending spike detected');
    expect(result.body).toContain('Dining');
  });

  it('falls back to template copy when the LLM call throws — never throws', async () => {
    const { service, llm } = makeService();
    llm.createMessage.mockRejectedValue(new Error('LLM down'));

    const result = await gen(service)(
      'AI_COACHING_NUDGE',
      { category: 'Groceries', percentProjected: 124 },
      'USD',
    );

    expect(result.title).toContain('Groceries');
    expect(result.body).toContain('on track to exceed');
  });
});

describe('InsightComputationService — scheduling', () => {
  it('runNightlyJob delegates to processAllWorkspaces', async () => {
    const { service } = makeService();
    const spy = jest.spyOn(service, 'processAllWorkspaces').mockResolvedValue(undefined);

    await service.runNightlyJob();

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
