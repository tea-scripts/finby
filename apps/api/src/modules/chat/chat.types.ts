export interface ChatActionPreview {
  amount: string;
  currency: string;
  merchant: string | null;
  category: string | null;
}

export interface ChatAction {
  type: 'TRANSACTION_CREATED';
  transactionId: string;
  preview: ChatActionPreview;
}

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
