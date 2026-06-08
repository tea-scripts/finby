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

export interface ToolExecResult {
  toolResult: string;
  action?: ChatAction;
  pending?: PendingConfirmation;
}
