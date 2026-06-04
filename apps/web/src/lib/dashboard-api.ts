import { useAuth } from './store';
import type { AccountView, BudgetView, SummaryResult, Transaction } from './types';

/** Per-section async state so each dashboard section paints independently. */
export interface SectionState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/** Dashboard data helpers — all via the store's authed() (bearer + 401 refresh). */
function authed<T>(path: string, init?: RequestInit): Promise<T> {
  return useAuth.getState().authed<T>(path, init);
}

export function getSummary(workspaceId: string, from: string, to: string): Promise<SummaryResult> {
  const q = new URLSearchParams({ from, to });
  return authed<SummaryResult>(`/workspaces/${workspaceId}/analytics/summary?${q}`);
}

export async function listBudgets(workspaceId: string): Promise<BudgetView[]> {
  const res = await authed<{ budgets: BudgetView[] }>(`/workspaces/${workspaceId}/budgets`);
  return res.budgets;
}

export async function listRecentTransactions(
  workspaceId: string,
  limit = 10,
): Promise<Transaction[]> {
  const res = await authed<{ transactions: Transaction[] }>(
    `/workspaces/${workspaceId}/transactions?limit=${limit}`,
  );
  return res.transactions;
}

export async function listAccounts(workspaceId: string): Promise<AccountView[]> {
  const res = await authed<{ accounts: AccountView[] }>(`/workspaces/${workspaceId}/accounts`);
  return res.accounts;
}
