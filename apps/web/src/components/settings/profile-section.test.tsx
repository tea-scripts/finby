import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ApiUser } from '../../lib/types';
import { DEFAULT_PREFERENCES } from '@finby/shared';
import { ProfileSection } from './profile-section';

// ── Mocks ──────────────────────────────────────────────────────────────────

const USER: ApiUser = {
  id: 'u1',
  displayName: 'Aisha',
  email: 'a@b.com',
  timezone: 'UTC',
  accountNumber: 'FB-100000042',
  preferences: DEFAULT_PREFERENCES,
  emailVerified: true,
  currentStreak: 0,
  longestStreak: 0,
};

const setUser = vi.fn();

vi.mock('../../lib/store', () => ({
  useAuth: vi.fn(
    (selector: (s: { user: ApiUser; setUser: typeof setUser }) => unknown) =>
      selector({ user: USER, setUser }),
  ),
}));

vi.mock('../../lib/settings-api', () => ({
  updateProfile: vi.fn(),
}));

import { updateProfile } from '../../lib/settings-api';

const mockUpdateProfile = vi.mocked(updateProfile);

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ProfileSection', () => {
  it('renders display name, email, and account number', () => {
    render(<ProfileSection />);

    expect(screen.getByDisplayValue('Aisha')).toBeInTheDocument();
    expect(screen.getByDisplayValue('a@b.com')).toBeInTheDocument();
    expect(screen.getByText('FB-100000042')).toBeInTheDocument();
  });

  it('editing the name + Save calls updateProfile then setUser with the result', async () => {
    const updated: ApiUser = { ...USER, displayName: 'Aisha Khan' };
    mockUpdateProfile.mockResolvedValue(updated);

    render(<ProfileSection />);

    fireEvent.change(screen.getByDisplayValue('Aisha'), {
      target: { value: 'Aisha Khan' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({
        displayName: 'Aisha Khan',
        timezone: 'UTC',
      });
    });

    await waitFor(() => {
      expect(setUser).toHaveBeenCalledWith(updated);
    });
  });

  it('shows an error when updateProfile rejects', async () => {
    mockUpdateProfile.mockRejectedValue(new Error('boom'));

    render(<ProfileSection />);

    fireEvent.change(screen.getByDisplayValue('Aisha'), {
      target: { value: 'Aisha Khan' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText(/couldn't save/i)).toBeInTheDocument();
    });
    expect(setUser).not.toHaveBeenCalled();
  });
});
