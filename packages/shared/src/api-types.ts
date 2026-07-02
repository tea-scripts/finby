import type { UserPreferences, SubscriptionTier, WorkspaceMemberRole } from './types';
import type { SupportCategory, SupportStatus } from './constants';

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
  /** The Terms of Service version the user accepted (required by the API). */
  acceptedTermsVersion: string;
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
  /** Achievements unlocked by this transaction (absent/empty if none). */
  newAchievements?: NewAchievement[];
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

/** GET analytics/by-category */
export interface CategoryBreakdownItem {
  category: { id: string; name: string; icon: string | null; color: string | null };
  total: string;
  percent: number;
  transactionCount: number;
}
export interface CategoryBreakdownResult {
  breakdown: CategoryBreakdownItem[];
  currency: string;
}

/** GET analytics/trend */
export interface TrendPoint {
  month: string; // YYYY-MM
  income: string;
  expenses: string;
  savings: string;
}
export interface TrendResult {
  trend: TrendPoint[];
  currency: string;
}

/** GET analytics/insight — structured signal + a plain message (a11y/fallback).
 *  The client composes the styled sentence from the structured fields. */
export interface InsightResult {
  period: { from: string; to: string };
  currency: string;
  direction: 'less' | 'more' | 'flat'; // current spend vs last month
  spendDeltaPercent: number; // magnitude >= 0; direction carries the sign
  projectionApplies: boolean; // true only for the in-progress current month
  projectedSpend: string | null;
  projectedSavings: string | null;
  comparedTo: { from: string; to: string };
  message: string;
}

/** GET budgets → { budgets: BudgetView[] } */
export interface BudgetView {
  id: string;
  category: { id: string; name: string; icon: string | null; color: string | null };
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
  icon?: string | null;
  color?: string | null;
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
  category: { id: string; name: string; icon: string | null; color: string | null } | null;
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

// ── Gamification (XP + achievements) ──────────────────────────────────────────

/** Mirror of the API's XpEvent Prisma enum. */
export type XpEvent =
  | 'STREAK_DAY'
  | 'STREAK_MILESTONE'
  | 'TRANSACTION_LOGGED'
  | 'GOAL_HIT'
  | 'STREAK_RECOVERY'
  | 'REFERRAL_BONUS'
  | 'DAILY_LOGIN';

export type AchievementTierName = 'BRONZE' | 'SILVER' | 'GOLD';
export type AchievementCategoryName = 'STREAK' | 'TRANSACTIONS' | 'GOALS';

/** GET /workspaces/:id/gamification/xp */
export interface XpSummary {
  balance: number;
  totalEarned: number;
  todayEarned: number;
}

/** An entry in the XP ledger (GET /gamification/xp/history). */
export interface XpTransactionView {
  id: string;
  event: XpEvent;
  delta: number;
  meta: unknown;
  createdAt: string;
}

/** An achievement definition as exposed to the web. */
export interface AchievementDefView {
  id: string;
  slug: string;
  category: string;
  tier: string;
  threshold: number;
  label: string;
  description: string;
}

export interface UnlockedAchievement {
  id: string;
  achievementDef: AchievementDefView;
  unlockedAt: string;
}

export type LockedAchievement = AchievementDefView;

/** GET /workspaces/:id/gamification/achievements */
export interface AchievementsResult {
  unlocked: UnlockedAchievement[];
  locked: LockedAchievement[];
}

/** Pushed in the chat TRANSACTION_CREATED action when a log unlocks a badge. */
export interface NewAchievement {
  slug: string;
  tier: AchievementTierName;
  label: string;
  /** ISO timestamp (Date serialized over the wire). */
  unlockedAt: string;
}

// ── Family / Members ─────────────────────────────────────────────────────────

export interface WorkspaceMembershipSummary {
  workspaceId: string;
  name: string;
  slug: string;
  tier: SubscriptionTier;
  role: WorkspaceMemberRole;
  baseCurrency: string;
  preferredCurrencies: string[];
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

export interface AlertView {
  id: string;
  type: string;
  status: 'UNREAD' | 'READ' | 'DISMISSED';
  title: string;
  body: string;
  createdAt: string;
}

export interface AlertListResult {
  alerts: AlertView[];
  unreadCount: number;
  nextCursor: string | null;
  hasMore: boolean;
}
