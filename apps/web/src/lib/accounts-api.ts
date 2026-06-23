import { createAccountsApi, type AuthedFetch } from '@finby/core';
import { useAuth } from './store';

export type { CreateAccountInput, UpdateAccountInput } from '@finby/core';

const authed: AuthedFetch = <T>(p: string, i?: RequestInit) => useAuth.getState().authed<T>(p, i);

export const { createAccount, updateAccount } = createAccountsApi(authed);
