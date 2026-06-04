import { useAuth } from './store';
import type {
  Category,
  Transaction,
  TransactionListResult,
  TransactionPatch,
  TransactionQuery,
} from './types';

function authed<T>(path: string, init?: RequestInit): Promise<T> {
  return useAuth.getState().authed<T>(path, init);
}

export function listTransactions(
  workspaceId: string,
  query: TransactionQuery,
): Promise<TransactionListResult> {
  const q = new URLSearchParams();
  q.set('limit', String(query.limit ?? 20));
  if (query.cursor) q.set('cursor', query.cursor);
  if (query.type) q.set('type', query.type);
  if (query.categoryId) q.set('categoryId', query.categoryId);
  if (query.fromDate) q.set('fromDate', query.fromDate);
  if (query.toDate) q.set('toDate', query.toDate);
  if (query.currency) q.set('currency', query.currency);
  return authed<TransactionListResult>(`/workspaces/${workspaceId}/transactions?${q}`);
}

export function updateTransaction(
  workspaceId: string,
  id: string,
  patch: TransactionPatch,
): Promise<Transaction> {
  return authed<Transaction>(`/workspaces/${workspaceId}/transactions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function voidTransaction(workspaceId: string, id: string): Promise<{ message: string }> {
  return authed<{ message: string }>(`/workspaces/${workspaceId}/transactions/${id}`, {
    method: 'DELETE',
  });
}

export async function listCategories(workspaceId: string): Promise<Category[]> {
  const res = await authed<{ categories: Category[] }>(`/workspaces/${workspaceId}/categories`);
  return res.categories;
}
