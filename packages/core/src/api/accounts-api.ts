import type { AccountType, AccountView } from '@finby/shared';
import type { AuthedFetch } from './contract';

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

export interface AccountsApi {
  createAccount(workspaceId: string, input: CreateAccountInput): Promise<AccountView>;
  updateAccount(workspaceId: string, accountId: string, patch: UpdateAccountInput): Promise<AccountView>;
}

export function createAccountsApi(authed: AuthedFetch): AccountsApi {
  return {
    createAccount(workspaceId, input) {
      return authed<AccountView>(`/workspaces/${workspaceId}/accounts`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    updateAccount(workspaceId, accountId, patch) {
      return authed<AccountView>(`/workspaces/${workspaceId}/accounts/${accountId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
    },
  };
}
