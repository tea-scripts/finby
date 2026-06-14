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

  it('not at risk: renders a plain badge with no button', async () => {
    mockGet.mockResolvedValue({
      currentStreak: 12, longestStreak: 12, atRisk: false, repairEligible: false, repairUsedThisMonth: false,
    });

    render(<StreakRepair />);

    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('w1'));
    expect(screen.queryByRole('button', { name: /streak at risk/i })).not.toBeInTheDocument();
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
