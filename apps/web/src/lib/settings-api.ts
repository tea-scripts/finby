import { createSettingsApi, type AuthedFetch } from '@finby/core';
import { useAuth } from './store';

export type { ProfilePatch, UpdateBaseCurrencyResult } from '@finby/core';

const authed: AuthedFetch = <T>(p: string, i?: RequestInit) => useAuth.getState().authed<T>(p, i);

export const { updateProfile, updateCurrencies, updateBaseCurrency } = createSettingsApi(authed);
