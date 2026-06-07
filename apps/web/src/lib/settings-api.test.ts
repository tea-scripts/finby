import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./store', () => ({
  useAuth: {
    getState: vi.fn(),
  },
}));

import { useAuth } from './store';
import { updateProfile, updateCurrencies } from './settings-api';

const mockAuthed = vi.fn();

beforeEach(() => {
  vi.mocked(useAuth.getState).mockReturnValue({ authed: mockAuthed } as unknown as ReturnType<typeof useAuth.getState>);
  mockAuthed.mockReset();
});

describe('updateProfile', () => {
  it('calls authed PATCH /auth/profile with displayName', () => {
    mockAuthed.mockResolvedValue({ id: 'u1', displayName: 'X' });
    updateProfile({ displayName: 'X' });
    expect(mockAuthed).toHaveBeenCalledWith('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({ displayName: 'X' }),
    });
  });

  it('calls authed PATCH /auth/profile with preferences', () => {
    mockAuthed.mockResolvedValue({ id: 'u1', displayName: 'X' });
    updateProfile({ preferences: { dateFormat: 'SHORT' } });
    expect(mockAuthed).toHaveBeenCalledWith('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({ preferences: { dateFormat: 'SHORT' } }),
    });
  });
});

describe('updateCurrencies', () => {
  it('calls authed PATCH /workspaces/:id/currencies with currencies array', () => {
    mockAuthed.mockResolvedValue({ preferredCurrencies: ['USD', 'EUR'] });
    updateCurrencies('w1', ['USD', 'EUR']);
    expect(mockAuthed).toHaveBeenCalledWith('/workspaces/w1/currencies', {
      method: 'PATCH',
      body: JSON.stringify({ currencies: ['USD', 'EUR'] }),
    });
  });
});
