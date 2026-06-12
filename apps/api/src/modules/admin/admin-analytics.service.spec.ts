import { AdminAnalyticsService } from './admin-analytics.service';

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    user: { count: jest.fn().mockResolvedValue(100), findMany: jest.fn().mockResolvedValue([]) },
    workspace: { count: jest.fn().mockResolvedValue(80) },
    transaction: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    subscription: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]) },
    feedback: { count: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue({ _avg: { rating: null } }), findMany: jest.fn().mockResolvedValue([]) },
    budget: { findMany: jest.fn().mockResolvedValue([]) },
    portfolioHolding: { findMany: jest.fn().mockResolvedValue([]) },
    alert: { findMany: jest.fn().mockResolvedValue([]) },
    conversation: { count: jest.fn().mockResolvedValue(0) },
    conversationMessage: { count: jest.fn().mockResolvedValue(0) },
    $queryRaw: jest.fn().mockResolvedValue([]),
    ...prismaOverrides,
  };
  // Redis cache that always misses then stores.
  const redis = { client: { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK') } };
  const config = { get: () => undefined };
  const svc = new AdminAnalyticsService(prisma as never, redis as never, config as never);
  return { svc, prisma };
}

describe('AdminAnalyticsService.growth', () => {
  it('computes totals, tier split, and active-user unions', async () => {
    const { svc, prisma } = makeService();
    // 100 total users; tier split: 60 free workspaces, 20 paid
    (prisma.workspace.count as jest.Mock)
      .mockResolvedValueOnce(80) // total
      .mockResolvedValueOnce(20); // paid (tier != FREE)
    // active = union of login-recent users and txn-logging users
    (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]); // recent logins
    (prisma.transaction.findMany as jest.Mock).mockResolvedValue([{ loggedByUserId: 'u2' }, { loggedByUserId: 'u3' }]);
    // signups raw series
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ date: '2026-06-10', value: 3n }]);

    const res = await svc.growth({});
    expect(res.totalUsers).toBe(100);
    expect(res.totalWorkspaces).toBe(80);
    expect(res.tierSplit).toEqual({ free: 60, paid: 20 });
    // union of {u1,u2} and {u2,u3} = 3 distinct
    expect(res.dau).toBe(3);
    expect(res.signups).toEqual([{ date: '2026-06-10', value: 3 }]);
  });
});

describe('AdminAnalyticsService.engagement', () => {
  it('computes totals, chat counts, and feature adoption %', async () => {
    const { svc, prisma } = makeService();
    (prisma.transaction.count as jest.Mock).mockResolvedValue(500);
    (prisma.conversation.count as jest.Mock).mockResolvedValue(40);
    (prisma.conversationMessage.count as jest.Mock).mockResolvedValue(900);
    (prisma.workspace.count as jest.Mock).mockResolvedValue(100); // total workspaces
    // distinct workspaces using each feature
    (prisma.budget.findMany as jest.Mock).mockResolvedValue([{ workspaceId: 'w1' }, { workspaceId: 'w2' }]);
    (prisma.portfolioHolding.findMany as jest.Mock).mockResolvedValue([{ workspaceId: 'w1' }]);
    (prisma.alert.findMany as jest.Mock).mockResolvedValue([]);
    // streak buckets from raw users
    (prisma.user.findMany as jest.Mock).mockResolvedValue([
      { currentStreak: 0 }, { currentStreak: 3 }, { currentStreak: 10 }, { currentStreak: 40 },
    ]);
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

    const res = await svc.engagement({});
    expect(res.totalTransactions).toBe(500);
    expect(res.conversations).toBe(40);
    expect(res.chatMessages).toBe(900);
    expect(res.featureAdoption).toEqual({ budgets: 2, portfolio: 1, alerts: 0 });
    expect(res.streakDistribution).toEqual([
      { bucket: '0', users: 1 },
      { bucket: '1-6', users: 1 },
      { bucket: '7-29', users: 1 },
      { bucket: '30+', users: 1 },
    ]);
  });
});

describe('AdminAnalyticsService.revenue', () => {
  it('computes MRR from active paid subs and breaks down by tier/provider/status', async () => {
    const { svc, prisma } = makeService();
    // groupBy is called 3×: by tier (active paid), by provider, by status.
    (prisma.subscription.groupBy as jest.Mock)
      .mockResolvedValueOnce([
        { tier: 'PRO', _count: { _all: 2 } },     // 2 × 499
        { tier: 'PREMIUM', _count: { _all: 1 } },  // 1 × 999
      ])
      .mockResolvedValueOnce([
        { billingProvider: 'STRIPE', _count: { _all: 2 } },
        { billingProvider: 'PAYSTACK', _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        { status: 'ACTIVE', _count: { _all: 3 } },
        { status: 'PAST_DUE', _count: { _all: 1 } },
      ]);
    (prisma.subscription.count as jest.Mock).mockResolvedValue(0); // trials
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]); // new/churn series

    const res = await svc.revenue({});
    expect(res.mrrMinor).toBe(2 * 499 + 1 * 999); // 1997
    expect(res.currency).toBe('USD');
    expect(res.paidByTier).toEqual([
      { tier: 'PRO', count: 2 },
      { tier: 'PREMIUM', count: 1 },
    ]);
    expect(res.statusBreakdown).toContainEqual({ status: 'PAST_DUE', count: 1 });
  });
});

describe('AdminAnalyticsService.ops', () => {
  it('aggregates feedback, past-due count, and the Sentry link-out', async () => {
    const { svc, prisma } = makeService({}); // default config.get returns undefined → sentryUrl null
    (prisma.feedback.count as jest.Mock).mockResolvedValue(12);
    (prisma.feedback.aggregate as jest.Mock).mockResolvedValue({ _avg: { rating: 4.25 } });
    (prisma.feedback.findMany as jest.Mock).mockResolvedValue([
      { rating: 5, comment: 'great', createdAt: new Date('2026-06-11T00:00:00Z') },
    ]);
    (prisma.subscription.count as jest.Mock).mockResolvedValue(3); // past due

    const res = await svc.ops();
    expect(res.feedbackTotal).toBe(12);
    expect(res.feedbackAvgRating).toBe(4.25);
    expect(res.pastDueSubscriptions).toBe(3);
    expect(res.recentFeedback[0]?.comment).toBe('great');
    expect(res.sentryUrl).toBeNull();
  });
});
