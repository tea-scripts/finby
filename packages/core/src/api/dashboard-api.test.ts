import { describe, expect, it, vi } from 'vitest';
import { createDashboardApi } from './dashboard-api';

function mockAuthed(payload: unknown) {
  return vi.fn(async (_path: string, _init?: RequestInit) => payload as never);
}

describe('createDashboardApi', () => {
  it('getSummary builds the analytics path with from/to query', async () => {
    const authed = mockAuthed({ totalIncome: '0' });
    const api = createDashboardApi(authed);
    await api.getSummary('ws1', '2026-06-01', '2026-06-23');
    expect(authed).toHaveBeenCalledWith(
      '/workspaces/ws1/analytics/summary?from=2026-06-01&to=2026-06-23',
    );
  });

  it('listBudgets unwraps the { budgets } envelope', async () => {
    const authed = mockAuthed({ budgets: [{ id: 'b1' }] });
    const api = createDashboardApi(authed);
    await expect(api.listBudgets('ws1')).resolves.toEqual([{ id: 'b1' }]);
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/budgets');
  });

  it('listRecentTransactions defaults limit to 10 and unwraps { transactions }', async () => {
    const authed = mockAuthed({ transactions: [{ id: 't1' }] });
    const api = createDashboardApi(authed);
    await expect(api.listRecentTransactions('ws1')).resolves.toEqual([{ id: 't1' }]);
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/transactions?limit=10');
  });

  it('listAccounts unwraps the { accounts } envelope', async () => {
    const authed = mockAuthed({ accounts: [{ id: 'a1' }] });
    const api = createDashboardApi(authed);
    await expect(api.listAccounts('ws1')).resolves.toEqual([{ id: 'a1' }]);
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/accounts');
  });

  it('getByCategory builds the range+type query and returns the breakdown', async () => {
    const authed = mockAuthed({ breakdown: [{ category: { id: 'c1' } }], currency: 'USD' });
    const api = createDashboardApi(authed);
    await api.getByCategory('ws1', '2026-07-01', '2026-07-31', 'EXPENSE');
    expect(authed).toHaveBeenCalledWith(
      '/workspaces/ws1/analytics/by-category?from=2026-07-01&to=2026-07-31&type=EXPENSE',
    );
  });

  it('getTrend defaults months to 6', async () => {
    const authed = mockAuthed({ trend: [], currency: 'USD' });
    const api = createDashboardApi(authed);
    await api.getTrend('ws1');
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/analytics/trend?months=6');
  });

  it('getInsight builds the range query', async () => {
    const authed = mockAuthed({ direction: 'flat' });
    const api = createDashboardApi(authed);
    await api.getInsight('ws1', '2026-07-01', '2026-07-15');
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/analytics/insight?from=2026-07-01&to=2026-07-15');
  });
});
