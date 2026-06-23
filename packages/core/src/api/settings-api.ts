import type { ApiUser, UserPreferences } from '@finby/shared';
import type { AuthedFetch } from './contract';

export interface ProfilePatch {
  displayName?: string;
  timezone?: string;
  preferences?: Partial<UserPreferences>;
}

export interface UpdateBaseCurrencyResult {
  baseCurrency: string;
  preferredCurrencies: string[];
  recomputed: number;
}

export interface SettingsApi {
  updateProfile(patch: ProfilePatch): Promise<ApiUser>;
  updateCurrencies(workspaceId: string, currencies: string[]): Promise<{ preferredCurrencies: string[] }>;
  updateBaseCurrency(workspaceId: string, baseCurrency: string): Promise<UpdateBaseCurrencyResult>;
}

export function createSettingsApi(authed: AuthedFetch): SettingsApi {
  return {
    updateProfile(patch) {
      return authed<ApiUser>(`/auth/profile`, { method: 'PATCH', body: JSON.stringify(patch) });
    },
    updateCurrencies(workspaceId, currencies) {
      return authed<{ preferredCurrencies: string[] }>(
        `/workspaces/${workspaceId}/currencies`,
        { method: 'PATCH', body: JSON.stringify({ currencies }) },
      );
    },
    updateBaseCurrency(workspaceId, baseCurrency) {
      return authed<UpdateBaseCurrencyResult>(
        `/workspaces/${workspaceId}/currencies/base`,
        { method: 'PATCH', body: JSON.stringify({ baseCurrency }) },
      );
    },
  };
}
