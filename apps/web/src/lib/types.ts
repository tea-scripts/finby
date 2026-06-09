import type { UserPreferences } from '@finby/shared';

export type SubscriptionTier = 'FREE' | 'PRO' | 'PREMIUM' | 'FAMILY';

export interface ApiUser {
  id: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  timezone: string;
  accountNumber: string | null;
  preferences: UserPreferences;
}

export interface ApiWorkspace {
  id: string;
  name: string;
  slug: string;
  tier: SubscriptionTier;
  baseCurrency: string;
  preferredCurrencies: string[];
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

export type ChatAction = TransactionCreatedAction | BudgetSetAction;

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

/** GET /workspaces/:id/conversations */
export interface ConversationListResult {
  conversations: ConversationSummary[];
}

/** POST /workspaces/:id/conversations */
export interface CreatedConversation {
  id: string;
  title: string | null;
  createdAt: string;
}

export interface MessagesResult {
  messages: ChatMessageView[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ── Dashboard / Transactions ─────────────────────────────────────────────

/** GET analytics/summary */
export interface SummaryResult {
  period: { from: string; to: string };
  totalIncome: string;
  totalExpenses: string;
  netSavings: string;
  savingsRate: number;
  currency: string;
  transactionCount: number;
}

/** GET budgets → { budgets: BudgetView[] } */
export interface BudgetView {
  id: string;
  category: { id: string; name: string };
  amountLimit: string;
  amountSpent: string;
  currency: string;
  utilizationPercent: number;
  period: string;
  periodStart: string;
  periodEnd: string;
  isActive: boolean;
}

/** GET accounts → AccountView[] */
export interface AccountView {
  id: string;
  name: string;
  currency: string;
  accountType: string;
  balance: string;
  color: string | null;
  icon: string | null;
  isArchived: boolean;
}

/** A category as needed by filter/edit pickers (GET categories → { categories }). */
export interface Category {
  id: string;
  name: string;
  isArchived: boolean;
}

/** GET/PATCH transactions item */
export interface Transaction {
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

/** GET transactions */
export interface TransactionListResult {
  transactions: Transaction[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** Fields editable via PATCH transactions/:id. */
export interface TransactionPatch {
  categoryId?: string | null;
  merchant?: string | null;
  description?: string | null;
  transactionDate?: string;
  tags?: string[];
}

/** Query params for GET transactions. */
export interface TransactionQuery {
  cursor?: string;
  limit?: number;
  type?: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  categoryId?: string;
  fromDate?: string;
  toDate?: string;
  currency?: string;
}

// ── Billing / Subscription ───────────────────────────────────────────────────

export type SubscriptionStatus = 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELED' | 'PAUSED';
export type BillingProviderName = 'STRIPE' | 'PAYSTACK' | 'LEMONSQUEEZY';

export interface SubscriptionView {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  billingProvider: BillingProviderName | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  pendingTier: SubscriptionTier | null;
  pendingTierEffectiveAt: string | null;
}

export interface BillingPlan {
  tier: 'PRO' | 'PREMIUM' | 'FAMILY';
  name: string;
  priceDisplay: string;
  amountMinor: number;
  currency: string;
  interval: string;
  highlights: string[];
}

// ── Family / Members ─────────────────────────────────────────────────────────

export type WorkspaceMemberRole = 'OWNER' | 'CO_MANAGER' | 'VIEWER';

export interface WorkspaceMembershipSummary {
  workspaceId: string;
  name: string;
  slug: string;
  tier: SubscriptionTier;
  role: WorkspaceMemberRole;
  baseCurrency: string;
}

export interface MemberView {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  role: WorkspaceMemberRole;
  joinedAt: string;
  isSelf: boolean;
}

export interface InviteView {
  id: string;
  email: string;
  role: WorkspaceMemberRole;
  invitedByUserId: string;
  expiresAt: string;
  createdAt: string;
}

export interface InvitePreview {
  workspaceName: string;
  email: string;
  role: WorkspaceMemberRole;
  state: 'valid' | 'expired' | 'revoked' | 'accepted';
}
