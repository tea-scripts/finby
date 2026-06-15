import type { NewAchievement } from '../streaks/streaks.types';

export interface ChatActionPreview {
  amount: string;
  currency: string;
  merchant: string | null;
  category: string | null;
}

export interface TransactionCreatedAction {
  type: 'TRANSACTION_CREATED';
  transactionId: string;
  txType: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  preview: ChatActionPreview;
  /** The logger's spending streak after this transaction (null if unavailable). */
  currentStreak: number | null;
  /** Achievements unlocked by this transaction (empty if none). */
  newAchievements: NewAchievement[];
}

export interface BudgetSetAction {
  type: 'BUDGET_SET';
  preview: { currency: string; amount?: string; category?: string | null };
}

export interface TransactionUpdatedAction {
  type: 'TRANSACTION_UPDATED';
  transactionId: string;
  preview: ChatActionPreview;
}

export interface HoldingUpdatedAction {
  type: 'HOLDING_UPDATED';
  preview: { fromTicker: string; toTicker: string };
}

export type ChatAction =
  | TransactionCreatedAction
  | BudgetSetAction
  | TransactionUpdatedAction
  | HoldingUpdatedAction;

export interface PendingConfirmation {
  confirmationId: string;
  question: string;
  draft: Record<string, unknown>;
}

export interface ChatMessageView {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

export interface ChatResult {
  message: ChatMessageView;
  actions: ChatAction[];
  pendingConfirmations: PendingConfirmation[];
}

export type ChatStreamEvent =
  | { type: 'start' }
  | { type: 'text'; text: string }
  | { type: 'action'; action: ChatAction }
  | { type: 'pending'; confirmation: PendingConfirmation }
  | { type: 'done'; message: ChatMessageView }
  | { type: 'error'; code: string; message: string; details?: unknown };

export interface ToolExecResult {
  toolResult: string;
  action?: ChatAction;
  pending?: PendingConfirmation;
}
