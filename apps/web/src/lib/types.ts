import type { SupportCategory, SupportStatus, UserPreferences } from '@finby/shared';

export type SubscriptionTier = 'FREE' | 'PRO' | 'PREMIUM' | 'FAMILY';

/** A user's support ticket (GET /support/tickets → { tickets }). */
export interface SupportTicketView {
  id: string;
  category: SupportCategory;
  subject: string;
  message: string;
  status: SupportStatus;
  resolvedAt: string | null;
  createdAt: string;
}

export interface ApiUser {
  id: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  timezone: string;
  accountNumber: string | null;
  preferences: UserPreferences;
  /** Consecutive local days with at least one logged transaction. */
  currentStreak: number;
  longestStreak: number;
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
  /** The logger's spending streak after this transaction (null if unavailable). */
  currentStreak: number | null;
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

export interface ChatStreamHandlers {
  onText: (text: string) => void;
  onAction: (action: ChatAction) => void;
  onPending: (confirmation: PendingConfirmation) => void;
  onDone: (message: ChatMessageView) => void;
  onError: (error: { code: string; message: string; details?: unknown }) => void;
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

/** Body for POST transactions (manual logging, e.g. confirmed receipt scans). */
export interface CreateTransactionInput {
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  amountOriginal: string;
  currencyOriginal: string;
  categoryId?: string;
  accountId?: string;
  toAccountId?: string;
  merchant?: string;
  description?: string;
  transactionDate?: string;
  tags?: string[];
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

// ── Receipts ─────────────────────────────────────────────────────────────────

export interface ReceiptLineItem {
  name: string;
  amount: number;
}

/** POST /workspaces/:id/receipts/extract */
export interface ReceiptExtraction {
  merchant: string;
  total: number;
  currency: string;
  /** YYYY-MM-DD */
  date: string;
  category: string;
  lineItems: ReceiptLineItem[];
  confidence: number;
  isMixedCategories: boolean;
  /** total > 100 OR mixed categories — show the line items for review. */
  showLineItems: boolean;
  /** Set when confidence < 0.5 — surface a verify warning. */
  lowConfidence?: boolean;
  notes: string | null;
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

export interface StreakStatus {
  currentStreak: number;
  longestStreak: number;
  atRisk: boolean;
  repairEligible: boolean;
  repairUsedThisMonth: boolean;
}

export interface StreakCalendar {
  from: string;
  to: string;
  activeDays: string[];
  repairedDays: string[];
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
  hasAccount: boolean;
}
