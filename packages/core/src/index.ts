// @finby/core — framework-agnostic transport + formatting kernel shared by
// apps/web and apps/mobile. Never import platform APIs here; inject them.
export const CORE_PACKAGE = '@finby/core';

export { ApiError, createHttpClient } from './http';
export type { HttpClient } from './http';
export { parseSseFrames } from './sse';
export type { ParsedSseEvent } from './sse';
export {
  money, shortDate, timeOfDay, dayKey, dayLabel, currentMonthRange,
  currentMonth, addMonths, monthToRange, formatMonthLabel,
} from './format';
export type { MonthRef } from './format';
export { createAuthedClient } from './authed';
export type { AuthedClient, AuthedClientConfig, TokenPair } from './authed';
export type { AuthedFetch, ApiFetch, AuthedStream } from './api/contract';
export { createDashboardApi } from './api/dashboard-api';
export type { DashboardApi, SectionState } from './api/dashboard-api';
export { createTransactionsApi } from './api/transactions-api';
export type { TransactionsApi } from './api/transactions-api';
export { createAccountsApi } from './api/accounts-api';
export type { AccountsApi, CreateAccountInput, UpdateAccountInput } from './api/accounts-api';
export { createStreaksApi } from './api/streaks-api';
export type { StreaksApi } from './api/streaks-api';
export { createAlertsApi } from './api/alerts-api';
export type { AlertsApi } from './api/alerts-api';
export { createSettingsApi } from './api/settings-api';
export type { SettingsApi, ProfilePatch, UpdateBaseCurrencyResult } from './api/settings-api';
export { createSupportApi } from './api/support-api';
export type { SupportApi, CreateSupportTicketInput } from './api/support-api';
export { createFeedbackApi } from './api/feedback-api';
export type { FeedbackApi, FeedbackResult } from './api/feedback-api';
export { createMembersApi } from './api/members-api';
export type { MembersApi } from './api/members-api';
export { createAuthApi } from './api/auth-api';
export type { AuthApi } from './api/auth-api';
export { createBillingApi } from './api/billing-api';
export type { BillingApi } from './api/billing-api';
export { createReceiptsApi } from './api/receipts-api';
export type { ReceiptsApi } from './api/receipts-api';
export { createGamificationApi } from './api/gamification-api';
export type { GamificationApi } from './api/gamification-api';
export { createChatApi } from './api/chat-api';
export type { ChatApi } from './api/chat-api';
