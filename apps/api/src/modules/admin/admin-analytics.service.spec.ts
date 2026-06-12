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
