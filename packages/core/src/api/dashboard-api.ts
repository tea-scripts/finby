import type {
  AccountView,
  BudgetView,
  CategoryBreakdownResult,
  InsightResult,
  SummaryResult,
  Transaction,
  TrendResult,
} from '@finby/shared';
import type { AuthedFetch } from './contract';

/** Per-section async state so each dashboard section paints independently. */
export interface SectionState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export interface DashboardApi {
  getSummary(workspaceId: string, from: string, to: string): Promise<SummaryResult>;
  listBudgets(workspaceId: string): Promise<BudgetView[]>;
  listRecentTransactions(workspaceId: string, limit?: number): Promise<Transaction[]>;
  listAccounts(workspaceId: string): Promise<AccountView[]>;
  getByCategory(
    workspaceId: string,
    from: string,
    to: string,
    type?: 'EXPENSE' | 'INCOME',
  ): Promise<CategoryBreakdownResult>;
  getTrend(workspaceId: string, months?: number): Promise<TrendResult>;
  /** Month-scoped: the insight month is derived from `from` (its calendar
   *  month); `to` is passed for signature parity with summary/by-category but
   *  is not read server-side. */
  getInsight(workspaceId: string, from: string, to: string): Promise<InsightResult>;
}

/** Dashboard data helpers. Transport (bearer + 401 refresh) is injected. */
export function createDashboardApi(authed: AuthedFetch): DashboardApi {
  return {
    getSummary(workspaceId, from, to) {
      const q = new URLSearchParams({ from, to });
      return authed<SummaryResult>(`/workspaces/${workspaceId}/analytics/summary?${q}`);
    },
    async listBudgets(workspaceId) {
      const res = await authed<{ budgets: BudgetView[] }>(`/workspaces/${workspaceId}/budgets`);
      return res.budgets;
    },
    async listRecentTransactions(workspaceId, limit = 10) {
      const res = await authed<{ transactions: Transaction[] }>(
        `/workspaces/${workspaceId}/transactions?limit=${limit}`,
      );
      return res.transactions;
    },
    async listAccounts(workspaceId) {
      const res = await authed<{ accounts: AccountView[] }>(`/workspaces/${workspaceId}/accounts`);
      return res.accounts;
    },
    getByCategory(workspaceId, from, to, type = 'EXPENSE') {
      const q = new URLSearchParams({ from, to, type });
      return authed<CategoryBreakdownResult>(
        `/workspaces/${workspaceId}/analytics/by-category?${q}`,
      );
    },
    getTrend(workspaceId, months = 6) {
      const q = new URLSearchParams({ months: String(months) });
      return authed<TrendResult>(`/workspaces/${workspaceId}/analytics/trend?${q}`);
    },
    getInsight(workspaceId, from, to) {
      const q = new URLSearchParams({ from, to });
      return authed<InsightResult>(`/workspaces/${workspaceId}/analytics/insight?${q}`);
    },
  };
}
