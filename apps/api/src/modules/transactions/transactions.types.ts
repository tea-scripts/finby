import type { BudgetSpendChange } from '../budgets/budgets.types';

export type TransactionTypeP2 = 'EXPENSE' | 'INCOME' | 'TRANSFER';
export type TransactionStatusP2 = 'CONFIRMED' | 'PENDING';

export interface CreateTransactionParams {
  workspaceId: string;
  loggedByUserId: string;
  baseCurrency: string;
  type: TransactionTypeP2;
  amountOriginal: string;
  currencyOriginal: string;
  transactionDate: string;
  categoryId?: string | null;
  accountId?: string | null;
  toAccountId?: string | null;
  merchant?: string | null;
  description?: string | null;
  tags?: string[];
  aiConfidence?: number | null;
  sourceMessageId?: string | null;
  status?: TransactionStatusP2;
}

export interface TransactionView {
  id: string;
  type: string;
  status: string;
  amountOriginal: string;
  currencyOriginal: string;
  amountBase: string;
  currencyBase: string;
  fxRateUsed: string;
  merchant: string | null;
  description: string | null;
  category: { id: string; name: string } | null;
  account: { id: string; name: string } | null;
  transactionDate: string;
  tags: string[];
  aiConfidence: number | null;
  loggedByUserId: string;
  createdAt: string;
}

export interface TransactionListResult {
  transactions: TransactionView[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CreateTransactionResult {
  transaction: TransactionView;
  budgetChange: BudgetSpendChange | null;
  /** The logger's spending streak after this transaction, or null if the
   *  streak update failed (it never blocks the transaction itself). */
  currentStreak: number | null;
}
