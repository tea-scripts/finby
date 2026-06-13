import { useAuth } from './store';
import type { ApiUser } from './types';
import type { UserPreferences } from '@finby/shared';

function authed<T>(path: string, init?: RequestInit): Promise<T> {
  return useAuth.getState().authed<T>(path, init);
}

export interface ProfilePatch {
  displayName?: string;
  timezone?: string;
  preferences?: Partial<UserPreferences>;
}

export function updateProfile(patch: ProfilePatch): Promise<ApiUser> {
  return authed<ApiUser>(`/auth/profile`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export function updateCurrencies(
  workspaceId: string,
  currencies: string[],
): Promise<{ preferredCurrencies: string[] }> {
  return authed<{ preferredCurrencies: string[] }>(
    `/workspaces/${workspaceId}/currencies`,
    { method: 'PATCH', body: JSON.stringify({ currencies }) },
  );
}

export interface UpdateBaseCurrencyResult {
  baseCurrency: string;
  preferredCurrencies: string[];
  recomputed: number;
}

export function updateBaseCurrency(
  workspaceId: string,
  baseCurrency: string,
): Promise<UpdateBaseCurrencyResult> {
  return authed<UpdateBaseCurrencyResult>(
    `/workspaces/${workspaceId}/currencies/base`,
    { method: 'PATCH', body: JSON.stringify({ baseCurrency }) },
  );
}
