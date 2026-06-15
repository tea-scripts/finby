import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StreakSummaryRow } from './StreakSummaryRow';
import type { StreakStatus, XpSummary } from '@/lib/types';

vi.mock('@/lib/streaks-api', () => ({ getStreakStatus: vi.fn() }));
vi.mock('@/lib/gamification-api', () => ({ getXpSummary: vi.fn() }));

import { getStreakStatus } from '@/lib/streaks-api';
import { getXpSummary } from '@/lib/gamification-api';

const status: StreakStatus = {
  currentStreak: 7,
  longestStreak: 12,
  atRisk: false,
  repairEligible: false,
  repairUsedThisMonth: false,
};
const xp: XpSummary = { balance: 42, totalEarned: 100, todayEarned: 3 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getStreakStatus).mockResolvedValue(status);
  vi.mocked(getXpSummary).mockResolvedValue(xp);
});

describe('StreakSummaryRow', () => {
  it('renders the streak count and XP balance', async () => {
    render(<StreakSummaryRow workspaceId="w1" />);
    expect(await screen.findByText(/7-day streak/)).toBeInTheDocument();
    expect(await screen.findByText(/42 XP/)).toBeInTheDocument();
  });

  it('links "View progress" to /streaks', async () => {
    render(<StreakSummaryRow workspaceId="w1" />);
    const link = await screen.findByRole('link', { name: /view progress/i });
    expect(link).toHaveAttribute('href', '/streaks');
  });

  it('shows a loading skeleton while fetching', () => {
    vi.mocked(getStreakStatus).mockReturnValue(new Promise<StreakStatus>(() => {}));
    vi.mocked(getXpSummary).mockReturnValue(new Promise<XpSummary>(() => {}));
    const { container } = render(<StreakSummaryRow workspaceId="w1" />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });
});
