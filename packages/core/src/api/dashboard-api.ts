import type { AccountView, BudgetView, SummaryResult, Transaction } from '@finby/shared';
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
  };
}
