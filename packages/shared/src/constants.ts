import type { SubscriptionTier } from './types';

/**
 * Default spending categories seeded into every workspace on creation.
 * Order is intentional (most-common first). See FINBY build order STEP 2.
 */
export interface DefaultCategorySeed {
  name: string;
  icon: string;
  color: string;
}

export const DEFAULT_CATEGORIES: readonly DefaultCategorySeed[] = [
  { name: 'Groceries', icon: 'cart', color: '#1A7A4A' },
  { name: 'Dining', icon: 'utensils', color: '#E2683C' },
  { name: 'Transport', icon: 'car', color: '#3C7DE2' },
  { name: 'Entertainment', icon: 'film', color: '#8B5CF6' },
  { name: 'Shopping', icon: 'bag', color: '#EC4899' },
  { name: 'Health', icon: 'heart', color: '#EF4444' },
  { name: 'Utilities', icon: 'bolt', color: '#F59E0B' },
  { name: 'Housing', icon: 'home', color: '#0EA5E9' },
  { name: 'Education', icon: 'book', color: '#14B8A6' },
  { name: 'Other', icon: 'ellipsis', color: '#6B7280' },
] as const;

/**
 * Subscription tier limits, transcribed directly from the locked
 * Tier Enforcement Matrix (API Contract). `null` = unlimited.
 * Consumed by TierGuard (STEP 5).
 */
export interface TierLimits {
  chatMessagesPerDay: number | null;
  transactionHistoryDays: number | null;
  customCategories: number | null;
  currencies: number | null;
  analyticsTrendMonths: number | null;
  portfolio: boolean;
  netWorth: boolean;
  marketData: boolean;
  memberInvites: boolean;
  maxMembers: number;
  dataExport: boolean;
  proactiveCoaching: boolean;
}

export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  FREE: {
    chatMessagesPerDay: 20,
    transactionHistoryDays: 90,
    customCategories: 5,
    currencies: 1,
    analyticsTrendMonths: 3,
    portfolio: false,
    netWorth: false,
    marketData: false,
    memberInvites: false,
    maxMembers: 1,
    dataExport: false,
    proactiveCoaching: false,
  },
  PRO: {
    chatMessagesPerDay: null,
    transactionHistoryDays: null,
    customCategories: null,
    currencies: null,
    analyticsTrendMonths: null,
    portfolio: true,
    netWorth: true,
    marketData: true,
    memberInvites: false,
    maxMembers: 1,
    dataExport: true,
    proactiveCoaching: false,
  },
  PREMIUM: {
    chatMessagesPerDay: null,
    transactionHistoryDays: null,
    customCategories: null,
    currencies: null,
    analyticsTrendMonths: null,
    portfolio: true,
    netWorth: true,
    marketData: true,
    memberInvites: false,
    maxMembers: 1,
    dataExport: true,
    proactiveCoaching: true,
  },
  FAMILY: {
    chatMessagesPerDay: null,
    transactionHistoryDays: null,
    customCategories: null,
    currencies: null,
    analyticsTrendMonths: null,
    portfolio: true,
    netWorth: true,
    marketData: true,
    memberInvites: true,
    maxMembers: 5,
    dataExport: true,
    proactiveCoaching: true,
  },
};
