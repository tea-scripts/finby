import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./store', () => ({
  useAuth: {
    getState: vi.fn(),
  },
}));

import { useAuth } from './store';
import { createAccount, updateAccount } from './accounts-api';

const mockAuthed = vi.fn();

beforeEach(() => {
  vi.mocked(useAuth.getState).mockReturnValue({
    authed: mockAuthed,
  } as unknown as ReturnType<typeof useAuth.getState>);
  mockAuthed.mockReset();
});

describe('createAccount', () => {
  it('calls authed POST /workspaces/:id/accounts with the account body', () => {
    mockAuthed.mockResolvedValue({ id: 'a1', name: 'GCash' });
    createAccount('w1', {
      name: 'GCash',
      accountType: 'EWALLET',
      currency: 'PHP',
      initialBalance: '5000',
    });
    expect(mockAuthed).toHaveBeenCalledWith('/workspaces/w1/accounts', {
      method: 'POST',
      body: JSON.stringify({
        name: 'GCash',
        accountType: 'EWALLET',
        currency: 'PHP',
        initialBalance: '5000',
      }),
    });
  });
});

describe('updateAccount', () => {
  it('calls authed PATCH /workspaces/:id/accounts/:accountId with the patch', () => {
    mockAuthed.mockResolvedValue({ id: 'a1', name: 'GCash Wallet' });
    updateAccount('w1', 'a1', { name: 'GCash Wallet' });
    expect(mockAuthed).toHaveBeenCalledWith('/workspaces/w1/accounts/a1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'GCash Wallet' }),
    });
  });

  it('archives an account via PATCH isArchived', () => {
    mockAuthed.mockResolvedValue({ id: 'a1', isArchived: true });
    updateAccount('w1', 'a1', { isArchived: true });
    expect(mockAuthed).toHaveBeenCalledWith('/workspaces/w1/accounts/a1', {
      method: 'PATCH',
      body: JSON.stringify({ isArchived: true }),
    });
  });
});
