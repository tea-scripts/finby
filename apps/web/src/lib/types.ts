export type SubscriptionTier = 'FREE' | 'PRO' | 'PREMIUM' | 'FAMILY';

export interface ApiUser {
  id: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  timezone: string;
}

export interface ApiWorkspace {
  id: string;
  name: string;
  slug: string;
  tier: SubscriptionTier;
  baseCurrency: string;
}

export interface AuthResult {
  user: ApiUser;
  workspace: ApiWorkspace;
  accessToken: string;
  refreshToken: string;
}

/** Just the rotating token pair returned by POST /auth/refresh. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Body for POST /auth/register (mirrors the API's registerSchema). */
export interface RegisterInput {
  displayName: string;
  email: string;
  password: string;
  baseCurrency: string;
  timezone: string;
}

export interface ChatMessageView {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

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

export interface ChatResult {
  message: ChatMessageView;
  actions: ChatAction[];
  pendingConfirmations: PendingConfirmation[];
}

export interface ConversationSummary {
  id: string;
  title: string | null;
  messageCount: number;
  updatedAt: string;
}

export interface MessagesResult {
  messages: ChatMessageView[];
  nextCursor: string | null;
  hasMore: boolean;
}
