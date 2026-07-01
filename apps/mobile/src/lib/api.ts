import {
  createHttpClient,
  createDashboardApi, createTransactionsApi, createAccountsApi, createStreaksApi,
  createAlertsApi, createSettingsApi, createSupportApi, createFeedbackApi,
  createMembersApi, createAuthApi, createBillingApi, createReceiptsApi,
  createGamificationApi, createChatApi, createPushApi,
} from '@finby/core';
import type { MobileSession } from './session';

/** Bind every @finby/core API factory to the mobile session's transport.
 *  `apiFetch` (unauthenticated) is the core http client; members/auth/billing
 *  need it for their public endpoints. */
export function createMobileApi(session: MobileSession, apiBase: string) {
  const { authed, authedStream } = session;
  const { apiFetch } = createHttpClient({ baseUrl: apiBase });

  return {
    dashboard: createDashboardApi(authed),
    transactions: createTransactionsApi(authed),
    accounts: createAccountsApi(authed),
    streaks: createStreaksApi(authed),
    alerts: createAlertsApi(authed),
    settings: createSettingsApi(authed),
    support: createSupportApi(authed),
    feedback: createFeedbackApi(authed),
    members: createMembersApi({ authed, apiFetch }),
    auth: createAuthApi({ authed, apiFetch }),
    billing: createBillingApi({ authed, apiFetch }),
    receipts: createReceiptsApi(authed),
    gamification: createGamificationApi({ authed, authedStream, apiBase }),
    chat: createChatApi({ authed, authedStream }),
    push: createPushApi(authed),
  };
}

export type MobileApi = ReturnType<typeof createMobileApi>;
