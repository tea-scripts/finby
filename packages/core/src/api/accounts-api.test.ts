import { describe, expect, it, vi } from 'vitest';
import { createAccountsApi } from './accounts-api';

const ok = (payload: unknown) => vi.fn(async () => payload as never);

describe('createAccountsApi', () => {
  it('createAccount POSTs the input as JSON', async () => {
    const authed = ok({ id: 'a1' });
    await createAccountsApi(authed).createAccount('ws1', {
      name: 'Cash', accountType: 'CASH', currency: 'USD',
    });
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/accounts', {
      method: 'POST',
      body: JSON.stringify({ name: 'Cash', accountType: 'CASH', currency: 'USD' }),
    });
  });

  it('updateAccount PATCHes the account by id', async () => {
    const authed = ok({ id: 'a1' });
    await createAccountsApi(authed).updateAccount('ws1', 'a1', { name: 'Wallet' });
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/accounts/a1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Wallet' }),
    });
  });
});
