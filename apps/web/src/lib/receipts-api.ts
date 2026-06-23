import { createReceiptsApi, type AuthedFetch } from '@finby/core';
import { useAuth } from './store';

const authed: AuthedFetch = <T>(p: string, i?: RequestInit) => useAuth.getState().authed<T>(p, i);

export const { extractReceipt } = createReceiptsApi(authed);
