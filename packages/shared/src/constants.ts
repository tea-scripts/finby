import type { SubscriptionTier, UserPreferences } from './types';

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
  portfolioHoldings: number | null;
  netWorth: boolean;
  marketData: boolean;
  memberInvites: boolean;
  maxMembers: number;
  dataExport: boolean;
  proactiveCoaching: boolean;
}

/**
 * Paid-tier pricing for checkout. Amounts are in the smallest currency unit
 * (USD cents), billed monthly. FREE has no price. Transcribed from the PRD
 * (~$4.99 / ~$9.99 / ~$14.99).
 */
export interface TierPrice {
  amountMinor: number;
  currency: string;
  interval: 'month';
}

export const TIER_PRICING: Record<Exclude<SubscriptionTier, 'FREE'>, TierPrice> = {
  PRO: { amountMinor: 499, currency: 'USD', interval: 'month' },
  PREMIUM: { amountMinor: 999, currency: 'USD', interval: 'month' },
  FAMILY: { amountMinor: 1499, currency: 'USD', interval: 'month' },
};

/** Display price for a paid tier, e.g. 499 → "$4.99". */
export function formatTierPrice(tier: Exclude<SubscriptionTier, 'FREE'>): string {
  const p = TIER_PRICING[tier];
  return `$${(p.amountMinor / 100).toFixed(2)}`;
}

/** Marketing highlights per paid tier (UI + plans endpoint). */
export const TIER_HIGHLIGHTS: Record<Exclude<SubscriptionTier, 'FREE'>, string[]> = {
  PRO: ['90-day memory', 'Unlimited currencies', 'Advanced analytics'],
  PREMIUM: ['Permanent memory dossier', 'AI coaching & nudges', 'Priority support'],
  FAMILY: ['Up to 5 members', 'Shared workspace', 'Everything in Premium'],
};

export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  FREE: {
    chatMessagesPerDay: 20,
    transactionHistoryDays: 90,
    customCategories: 5,
    currencies: 1,
    analyticsTrendMonths: 3,
    portfolio: false,
    portfolioHoldings: 0,
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
    portfolioHoldings: 10,
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
    portfolioHoldings: null,
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
    portfolioHoldings: null,
    netWorth: true,
    marketData: true,
    memberInvites: true,
    maxMembers: 5,
    dataExport: true,
    proactiveCoaching: true,
  },
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  dateFormat: 'MEDIUM',
  numberFormat: 'GROUPED',
  currencyDisplay: 'SYMBOL',
  dailyReminders: true,
  lastDailyReminderAt: null,
  dismissedAnnouncements: [],
};

export interface Currency {
  code: string;
  name: string;
  symbol: string;
}

/** Canonical currency list — single source of truth for all pickers + validation. */
export const CURRENCIES: Currency[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh' },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GH₵' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  { code: 'BWP', name: 'Botswana Pula', symbol: 'P' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
];

export const CURRENCY_CODES: string[] = CURRENCIES.map((c) => c.code);

export function isCurrencyCode(code: string): boolean {
  return CURRENCY_CODES.includes(code);
}
