import { useAuth } from './store';
import type { AccountView } from './types';
import type { AccountType } from '@finby/shared';

function authed<T>(path: string, init?: RequestInit): Promise<T> {
  return useAuth.getState().authed<T>(path, init);
}

export interface CreateAccountInput {
  name: string;
  accountType: AccountType;
  currency: string;
  /** Non-negative decimal string; backend defaults to '0' when omitted. */
  initialBalance?: string;
  color?: string;
}

export interface UpdateAccountInput {
  name?: string;
  /** A hex color, or `null` to clear back to the default accent. */
  color?: string | null;
  icon?: string;
  isArchived?: boolean;
}

export function createAccount(
  workspaceId: string,
  input: CreateAccountInput,
): Promise<AccountView> {
  return authed<AccountView>(`/workspaces/${workspaceId}/accounts`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateAccount(
  workspaceId: string,
  accountId: string,
  patch: UpdateAccountInput,
): Promise<AccountView> {
  return authed<AccountView>(`/workspaces/${workspaceId}/accounts/${accountId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}
