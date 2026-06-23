import type {
  Category,
  CreateTransactionInput,
  Transaction,
  TransactionListResult,
  TransactionPatch,
  TransactionQuery,
} from '@finby/shared';
import type { AuthedFetch } from './contract';

export interface TransactionsApi {
  listTransactions(workspaceId: string, query: TransactionQuery): Promise<TransactionListResult>;
  createTransaction(workspaceId: string, input: CreateTransactionInput): Promise<Transaction>;
  updateTransaction(workspaceId: string, id: string, patch: TransactionPatch): Promise<Transaction>;
  voidTransaction(workspaceId: string, id: string): Promise<{ message: string }>;
  listCategories(workspaceId: string): Promise<Category[]>;
}

export function createTransactionsApi(authed: AuthedFetch): TransactionsApi {
  return {
    listTransactions(workspaceId, query) {
      const q = new URLSearchParams();
      q.set('limit', String(query.limit ?? 20));
      if (query.cursor) q.set('cursor', query.cursor);
      if (query.type) q.set('type', query.type);
      if (query.categoryId) q.set('categoryId', query.categoryId);
      if (query.fromDate) q.set('fromDate', query.fromDate);
      if (query.toDate) q.set('toDate', query.toDate);
      if (query.currency) q.set('currency', query.currency);
      return authed<TransactionListResult>(`/workspaces/${workspaceId}/transactions?${q}`);
    },
    createTransaction(workspaceId, input) {
      return authed<Transaction>(`/workspaces/${workspaceId}/transactions`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    updateTransaction(workspaceId, id, patch) {
      return authed<Transaction>(`/workspaces/${workspaceId}/transactions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
    },
    voidTransaction(workspaceId, id) {
      return authed<{ message: string }>(`/workspaces/${workspaceId}/transactions/${id}`, {
        method: 'DELETE',
      });
    },
    async listCategories(workspaceId) {
      const res = await authed<{ categories: Category[] }>(`/workspaces/${workspaceId}/categories`);
      return res.categories;
    },
  };
}
