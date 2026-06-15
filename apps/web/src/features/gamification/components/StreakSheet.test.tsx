import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StreakSheet } from './StreakSheet';
import type { NewAchievement, StreakCalendar, StreakStatus, XpSummary } from '@/lib/types';

vi.mock('@/lib/streaks-api', () => ({
  getStreakStatus: vi.fn(),
  repairStreak: vi.fn(),
  getStreakCalendar: vi.fn(),
}));
vi.mock('@/lib/gamification-api', () => ({
  getXpSummary: vi.fn(),
  getBadgeSvg: vi.fn(),
}));
vi.mock('@/lib/push', () => ({ enablePush: vi.fn(() => Promise.resolve('on')) }));
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const setUser = vi.fn();
vi.mock('@/lib/store', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useAuth: vi.fn((selector: any) => selector({ setUser })),
}));

import { getStreakStatus, repairStreak, getStreakCalendar } from '@/lib/streaks-api';
import { getXpSummary, getBadgeSvg } from '@/lib/gamification-api';

const activeStatus: StreakStatus = {
  currentStreak: 5,
  longestStreak: 9,
  atRisk: false,
  repairEligible: false,
  repairUsedThisMonth: false,
};
const calendar: StreakCalendar = {
  from: '2026-06-01',
  to: '2026-06-15',
  activeDays: ['2026-06-15'],
  repairedDays: [],
};
const xp: XpSummary = { balance: 50, totalEarned: 120, todayEarned: 5 };

function setStatus(patch: Partial<StreakStatus>) {
  vi.mocked(getStreakStatus).mockResolvedValue({ ...activeStatus, ...patch });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getStreakStatus).mockResolvedValue(activeStatus);
  vi.mocked(getStreakCalendar).mockResolvedValue(calendar);
  vi.mocked(getXpSummary).mockResolvedValue(xp);
  vi.mocked(getBadgeSvg).mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  vi.mocked(repairStreak).mockResolvedValue({ ...activeStatus, atRisk: false });
});

function renderSheet(props?: { milestoneAchievements?: NewAchievement[]; onClose?: () => void }) {
  return render(
    <StreakSheet
      open
      onClose={props?.onClose ?? vi.fn()}
      workspaceId="w1"
      milestoneAchievements={props?.milestoneAchievements}
    />,
  );
}

describe('StreakSheet', () => {
  it('renders a skeleton while loading', () => {
    vi.mocked(getStreakStatus).mockReturnValue(new Promise<StreakStatus>(() => {}));
    vi.mocked(getStreakCalendar).mockReturnValue(new Promise<StreakCalendar>(() => {}));
    vi.mocked(getXpSummary).mockReturnValue(new Promise<XpSummary>(() => {}));
    renderSheet();
    expect(document.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders the new-user state when the streak is 0', async () => {
    setStatus({ currentStreak: 0 });
    vi.mocked(getXpSummary).mockResolvedValue({ balance: 0, totalEarned: 0, todayEarned: 0 });
    renderSheet();
    expect(await screen.findByText(/every streak starts here/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enable notifications/i })).toBeInTheDocument();
  });

  it('renders the active state for an ongoing streak', async () => {
    renderSheet();
    expect(await screen.findByText(/building the habit/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /share your streak/i })).toBeInTheDocument();
  });

  it('renders the recoverable state when at risk with enough XP', async () => {
    setStatus({ atRisk: true });
    vi.mocked(getXpSummary).mockResolvedValue({ balance: 50, totalEarned: 80, todayEarned: 0 });
    renderSheet();
    expect(await screen.findByText(/missed yesterday/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /recover streak — 10 XP/i })).toBeEnabled();
  });

  it('renders the missed state when at risk without enough XP', async () => {
    setStatus({ atRisk: true });
    vi.mocked(getXpSummary).mockResolvedValue({ balance: 5, totalEarned: 5, todayEarned: 0 });
    renderSheet();
    expect(await screen.findByText(/need 5 more/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /recover streak \(10 XP\)/i })).toBeDisabled();
  });

  it('renders the milestone state when milestoneAchievements is non-empty', async () => {
    const ms: NewAchievement[] = [
      { slug: 'streak-bronze', tier: 'BRONZE', label: 'Week Warrior', unlockedAt: '2026-06-15T00:00:00Z' },
    ];
    renderSheet({ milestoneAchievements: ms });
    expect(await screen.findByText(/You've unlocked: Week Warrior/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });

  it('calls repairStreak when "Recover streak" is clicked', async () => {
    setStatus({ atRisk: true });
    vi.mocked(getXpSummary).mockResolvedValue({ balance: 50, totalEarned: 80, todayEarned: 0 });
    renderSheet();
    const btn = await screen.findByRole('button', { name: /recover streak — 10 XP/i });
    fireEvent.click(btn);
    await waitFor(() => expect(vi.mocked(repairStreak)).toHaveBeenCalledWith('w1'));
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    renderSheet({ onClose });
    await screen.findByText(/building the habit/i);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('links "See full history" to /streaks', async () => {
    renderSheet();
    const link = await screen.findByRole('link', { name: /see full history/i });
    expect(link).toHaveAttribute('href', '/streaks');
  });
});
