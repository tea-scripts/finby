import type { SupportCategory, SupportStatus } from './constants';

export interface TimeSeriesPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

/** Admin view of a support ticket (GET /admin/tickets → { tickets }). */
export interface AdminSupportTicket {
  id: string;
  category: SupportCategory;
  subject: string;
  message: string;
  status: SupportStatus;
  resolvedAt: string | null; // ISO
  createdAt: string; // ISO
  user: { email: string; displayName: string };
}

export interface GrowthMetrics {
  totalUsers: number;
  totalWorkspaces: number;
  signups: TimeSeriesPoint[]; // daily new users in range
  dau: number;
  wau: number;
  mau: number;
  activeLast7Pct: number; // % of all users active in last 7 days
  activeLast30Pct: number;
  tierSplit: { free: number; paid: number };
}

export interface EngagementMetrics {
  totalTransactions: number;
  transactionsPerDay: TimeSeriesPoint[];
  avgTransactionsPerActiveUser: number;
  conversations: number;
  chatMessages: number;
  streakDistribution: { bucket: string; users: number }[]; // e.g. "0","1-6","7-29","30+"
  featureAdoption: { budgets: number; portfolio: number; alerts: number }; // distinct workspaces using each feature
}

export interface RevenueMetrics {
  mrrMinor: number; // monthly recurring revenue in USD cents
  currency: 'USD';
  paidByTier: { tier: string; count: number }[];
  paidByProvider: { provider: string; count: number }[];
  statusBreakdown: { status: string; count: number }[];
  trials: number;
  newPaidPerDay: TimeSeriesPoint[];
  churnPerDay: TimeSeriesPoint[];
}

export interface StreakLeader {
  rank: number;
  displayName: string;
  email: string;
  currentStreak: number;
  longestStreak: number;
}

export interface StreakLeaderboards {
  current: StreakLeader[]; // top 25 by current streak (desc)
  longest: StreakLeader[]; // top 25 by longest streak (desc)
}

export interface OpsMetrics {
  feedbackTotal: number;
  feedbackAvgRating: number | null;
  recentFeedback: { rating: number; comment: string | null; createdAt: string }[];
  pastDueSubscriptions: number;
  sentryUrl: string | null; // link-out; null when unset
}

export interface FunnelStep {
  event: string; // PostHog event name
  label: string; // human-readable step label
  count: number; // users (or events) who reached this step
  conversionFromStart: number; // % of step-1 users who reached this step (0–100)
  conversionFromPrev: number; // % of the previous step's users who reached this step (0–100)
}

/**
 * A behavioural funnel sourced from PostHog (HogQL). `configured` is false when
 * PostHog env vars are unset on the API — the dashboard then shows a hint instead
 * of an empty chart, and these numbers reflect PostHog (ad-blocker-affected),
 * unlike the DB-derived metrics above.
 */
export interface FunnelMetrics {
  key: string; // funnel id, e.g. "activation"
  label: string; // funnel display name
  windowDays: number; // conversion window
  steps: FunnelStep[];
  configured: boolean;
}

export interface AdminUserRow {
  id: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;        // ISO
  lastLoginAt: string | null; // ISO
  /** Subscription of the workspace this user OWNS; null = free / none. */
  subscription: {
    tier: string;
    status: string;
    startedAt: string; // ISO — Subscription.createdAt
  } | null;
}

export interface AdminUsersPage {
  users: AdminUserRow[];
  total: number;    // total matching users (for pagination)
  page: number;     // 1-based
  pageSize: number; // 50
}
