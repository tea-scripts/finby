export interface TimeSeriesPoint {
  date: string; // YYYY-MM-DD
  value: number;
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
