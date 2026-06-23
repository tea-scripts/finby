import { createDashboardApi, type AuthedFetch } from '@finby/core';
import { useAuth } from './store';

export type { SectionState } from '@finby/core';

const authed: AuthedFetch = <T>(p: string, i?: RequestInit) => useAuth.getState().authed<T>(p, i);

export const { getSummary, listBudgets, listRecentTransactions, listAccounts } =
  createDashboardApi(authed);
