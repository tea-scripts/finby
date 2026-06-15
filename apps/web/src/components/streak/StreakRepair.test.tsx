import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StreakRepair } from './StreakRepair';

vi.mock('../../lib/streaks-api', () => ({
  getStreakStatus: vi.fn(),
  repairStreak: vi.fn(),
}));

// UpgradeModal pulls in its own store/api — stub it.
vi.mock('../billing/UpgradeModal', () => ({
  UpgradeModal: ({ open, source }: { open: boolean; source?: string }) =>
    open ? <div data-testid="upgrade-modal">{source}</div> : null,
}));

const setUser = vi.fn();
const state = { user: { currentStreak: 12, longestStreak: 12 }, workspace: { id: 'w1', tier: 'PRO' }, setUser };
vi.mock('../../lib/store', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useAuth: vi.fn((selector: any) => selector(state)),
}));

vi.mock('./StreakCalendar', () => ({ StreakCalendar: () => <div data-testid="streak-calendar" /> }));

import { getStreakStatus, repairStreak } from '../../lib/streaks-api';

const mockGet = vi.mocked(getStreakStatus);
const mockRepair = vi.mocked(repairStreak);

beforeEach(() => {
  vi.clearAllMocks();
  state.workspace.tier = 'PRO';
});

describe('StreakRepair', () => {
  it('Pro + eligible: tapping the at-risk badge confirms and repairs', async () => {
    mockGet.mockResolvedValue({
      currentStreak: 12, longestStreak: 12, atRisk: true, repairEligible: true, repairUsedThisMonth: false,
    });
    mockRepair.mockResolvedValue({
      currentStreak: 12, longestStreak: 12, atRisk: false, repairEligible: false, repairUsedThisMonth: true,
    });

    render(<StreakRepair />);

    const badge = await screen.findByRole('button', { name: /streak at risk/i });
    fireEvent.click(badge);

    const repairBtn = await screen.findByRole('button', { name: /^repair$/i });
    fireEvent.click(repairBtn);

    await waitFor(() => expect(mockRepair).toHaveBeenCalledWith('w1'));
    await waitFor(() => expect(setUser).toHaveBeenCalledWith({ currentStreak: 12, longestStreak: 12 }));
    // After repairing, the user is told how to keep the streak going.
    await waitFor(() =>
      expect(screen.getByText(/log a transaction today to keep it going/i)).toBeInTheDocument(),
    );
  });

  it('Free + at-risk: tapping the badge opens the UpgradeModal', async () => {
    state.workspace.tier = 'FREE';
    mockGet.mockResolvedValue({
      currentStreak: 12, longestStreak: 12, atRisk: true, repairEligible: false, repairUsedThisMonth: false,
    });

    render(<StreakRepair />);

    const badge = await screen.findByRole('button', { name: /streak at risk/i });
    fireEvent.click(badge);

    await waitFor(() =>
      expect(screen.getByTestId('upgrade-modal')).toHaveTextContent('streak_repair'),
    );
    expect(mockRepair).not.toHaveBeenCalled();
  });

  it('not at risk: the badge is not the at-risk repair button', async () => {
    mockGet.mockResolvedValue({
      currentStreak: 12, longestStreak: 12, atRisk: false, repairEligible: false, repairUsedThisMonth: false,
    });

    render(<StreakRepair />);

    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('w1'));
    // No at-risk repair affordance, and tapping never calls repair.
    expect(screen.queryByRole('button', { name: /streak at risk/i })).not.toBeInTheDocument();
    expect(mockRepair).not.toHaveBeenCalled();
  });

  it('shows the live store streak count, not a stale fetched one', async () => {
    // Store says 12 (kept current by the chat page); the fetched status is
    // behind at 5. The badge must reflect the store so a just-logged
    // transaction shows immediately.
    mockGet.mockResolvedValue({
      currentStreak: 5, longestStreak: 12, atRisk: false, repairEligible: false, repairUsedThisMonth: false,
    });

    render(<StreakRepair />);

    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('w1'));
    expect(screen.getByText('🔥 12')).toBeInTheDocument();
    expect(screen.queryByText('🔥 5')).not.toBeInTheDocument();
  });

  it('safe streak: tapping the badge shows a congratulatory tooltip', async () => {
    mockGet.mockResolvedValue({
      currentStreak: 12, longestStreak: 12, atRisk: false, repairEligible: false, repairUsedThisMonth: false,
    });

    render(<StreakRepair />);

    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('w1'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /streak: 12 days/i }));

    const tip = await screen.findByRole('status');
    expect(tip.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    expect(mockRepair).not.toHaveBeenCalled();
  });

  it('Pro + already used this month: tapping shows the used note, not a repair button', async () => {
    mockGet.mockResolvedValue({
      currentStreak: 12, longestStreak: 12, atRisk: true, repairEligible: false, repairUsedThisMonth: true,
    });

    render(<StreakRepair />);

    const badge = await screen.findByRole('button', { name: /streak at risk/i });
    fireEvent.click(badge);

    await waitFor(() =>
      expect(screen.getByText(/already used your streak repair this month/i)).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /^repair$/i })).not.toBeInTheDocument();
    expect(mockRepair).not.toHaveBeenCalled();
  });

  it('safe streak: opening the tooltip exposes a View calendar action that shows the calendar', async () => {
    mockGet.mockResolvedValue({
      currentStreak: 12, longestStreak: 12, atRisk: false, repairEligible: false, repairUsedThisMonth: false,
    });

    render(<StreakRepair />);

    const badge = await screen.findByRole('button', { name: /streak/i });
    fireEvent.click(badge); // opens celebration tooltip
    fireEvent.click(await screen.findByRole('button', { name: /view calendar/i }));

    expect(await screen.findByTestId('streak-calendar')).toBeInTheDocument();
  });

  it('Pro + eligible: a failed repair shows an error and does not update the user', async () => {
    mockGet.mockResolvedValue({
      currentStreak: 12, longestStreak: 12, atRisk: true, repairEligible: true, repairUsedThisMonth: false,
    });
    mockRepair.mockRejectedValue(new Error('boom'));

    render(<StreakRepair />);

    const badge = await screen.findByRole('button', { name: /streak at risk/i });
    fireEvent.click(badge);

    const repairBtn = await screen.findByRole('button', { name: /^repair$/i });
    fireEvent.click(repairBtn);

    await waitFor(() =>
      expect(screen.getByText(/couldn't repair your streak/i)).toBeInTheDocument(),
    );
    expect(setUser).not.toHaveBeenCalled();
  });
});
