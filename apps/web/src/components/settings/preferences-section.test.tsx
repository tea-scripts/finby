import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ApiUser } from '../../lib/types';
import { DEFAULT_PREFERENCES } from '@finby/shared';
import { PreferencesSection } from './preferences-section';

// ── Mocks ──────────────────────────────────────────────────────────────────

const USER: ApiUser = {
  id: 'u1',
  displayName: 'Aisha',
  email: 'a@b.com',
  timezone: 'UTC',
  accountNumber: 'FB-100000042',
  preferences: DEFAULT_PREFERENCES,
  emailVerified: true,
  currentStreak: 7,
  longestStreak: 12,
};

const WORKSPACE = { id: 'w1', tier: 'FREE' };
const setUser = vi.fn();

vi.mock('../../lib/store', () => ({
  useAuth: vi.fn(
    (
      selector: (s: {
        user: ApiUser;
        setUser: typeof setUser;
        workspace: typeof WORKSPACE;
      }) => unknown,
    ) => selector({ user: USER, setUser, workspace: WORKSPACE }),
  ),
}));

vi.mock('../../lib/settings-api', () => ({
  updateProfile: vi.fn(),
}));

// Push toggle's browser logic — fully stubbed so it never touches real APIs.
vi.mock('../../lib/push', () => ({
  isPushSupported: vi.fn(() => true),
  getPushState: vi.fn(() => Promise.resolve('off')),
  enablePush: vi.fn(() => Promise.resolve('on')),
  disablePush: vi.fn(() => Promise.resolve('off')),
}));

vi.mock('../streak/StreakCalendar', () => ({
  StreakCalendar: () => <div data-testid="streak-calendar" />,
}));

import { updateProfile } from '../../lib/settings-api';
import { usePushStore } from '../../lib/push-store';

const mockUpdateProfile = vi.mocked(updateProfile);

beforeEach(() => {
  vi.clearAllMocks();
  // Shared push store is a module singleton — reset so tests don't leak state.
  usePushStore.setState({ state: 'off', busy: false });
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('PreferencesSection', () => {
  it('renders the three preference dropdowns + the push toggle', async () => {
    render(<PreferencesSection />);

    expect(screen.getByRole('button', { name: 'Date format' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Currency display' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Number format' })).toBeInTheDocument();

    // NotifToggle renders once getPushState resolves (workspace present + supported).
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /enable notifications/i })).toBeInTheDocument();
    });
  });

  it('shows the current and best streak from the user', () => {
    render(<PreferencesSection />);
    expect(screen.getByText(/Current streak: 7 days/)).toBeInTheDocument();
    expect(screen.getByText(/Best: 12 days/)).toBeInTheDocument();
  });

  it('changing the date format saves { preferences: { dateFormat } } then setUser', async () => {
    const updated: ApiUser = {
      ...USER,
      preferences: { ...DEFAULT_PREFERENCES, dateFormat: 'ISO' },
    };
    mockUpdateProfile.mockResolvedValue(updated);

    render(<PreferencesSection />);

    // Open the date-format listbox, then pick the ISO option.
    fireEvent.click(screen.getByRole('button', { name: 'Date format' }));
    const isoOption = await screen.findByRole('option', { name: /ISO/ });
    fireEvent.click(isoOption);

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({ preferences: { dateFormat: 'ISO' } });
    });

    await waitFor(() => {
      expect(setUser).toHaveBeenCalledWith(updated);
    });
  });

  it('disables the daily-reminder switch and shows it off while push is off', async () => {
    render(<PreferencesSection />);
    const sw = await screen.findByRole('switch', { name: 'Daily reminder' });
    expect(sw).toBeDisabled();
    // Even though dailyReminders defaults to true, the switch must read "off"
    // until push is enabled — otherwise it misleadingly implies reminders are
    // active when no push subscription exists.
    expect(sw).toHaveAttribute('aria-checked', 'false');
  });

  it('renders the streak calendar in the streak block', () => {
    render(<PreferencesSection />);
    expect(screen.getByTestId('streak-calendar')).toBeInTheDocument();
  });

  it('enables the switch when push is on and saves dailyReminders on click', async () => {
    const { getPushState } = await import('../../lib/push');
    vi.mocked(getPushState).mockResolvedValue('on');
    mockUpdateProfile.mockResolvedValue({
      ...USER,
      preferences: { ...DEFAULT_PREFERENCES, dailyReminders: false },
    });

    render(<PreferencesSection />);

    const sw = await screen.findByRole('switch', { name: 'Daily reminder' });
    await waitFor(() => expect(sw).toBeEnabled());

    expect(sw).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(sw);
    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({ preferences: { dailyReminders: false } });
    });
  });
});
