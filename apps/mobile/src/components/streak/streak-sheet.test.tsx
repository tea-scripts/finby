// apps/mobile/src/components/streak/streak-sheet.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockAuthState = { user: { displayName: 'Tee', currentStreak: 5, longestStreak: 10 }, setStreak: jest.fn() };
jest.mock('../../lib/use-auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector(mockAuthState),
}));
jest.mock('../../lib/runtime.native', () => ({
  api: {
    streaks: { getStreakStatus: jest.fn(), repairStreak: jest.fn(), getStreakCalendar: jest.fn() },
    gamification: { getXpSummary: jest.fn() },
  },
}));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(async () => 'file://card.png') }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => {}) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));
jest.mock('../ui/wordmark', () => ({ Wordmark: () => null }));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { api } from '../../lib/runtime.native';
import { StreakSheet } from './streak-sheet';

const mock = api as unknown as {
  streaks: { getStreakStatus: jest.Mock; repairStreak: jest.Mock; getStreakCalendar: jest.Mock };
  gamification: { getXpSummary: jest.Mock };
};
const CAL = { from: '2026-01-01', to: '2026-06-30', activeDays: ['2026-06-30'], repairedDays: [] };

beforeEach(() => {
  mockAuthState.setStreak.mockReset();
  mock.streaks.getStreakStatus.mockReset();
  mock.streaks.repairStreak.mockReset();
  mock.streaks.getStreakCalendar.mockReset().mockResolvedValue(CAL);
  mock.gamification.getXpSummary.mockReset().mockResolvedValue({ balance: 40, totalEarned: 1250, todayEarned: 10 });
  (captureRef as jest.Mock).mockClear();
  (Sharing.shareAsync as jest.Mock).mockClear();
  mockPush.mockReset();
});

describe('StreakSheet', () => {
  it('shows the active state with a Share button', async () => {
    mock.streaks.getStreakStatus.mockResolvedValue({ currentStreak: 7, longestStreak: 10, atRisk: false, repairEligible: false, repairUsedThisMonth: false });
    await render(<StreakSheet open onClose={jest.fn()} workspaceId="w1" />);
    await waitFor(() => expect(screen.getByText('Share your streak')).toBeTruthy());
    expect(screen.getByTestId('streak-count')).toBeTruthy();
  });

  it('repairs a recoverable streak and syncs the badge', async () => {
    mock.streaks.getStreakStatus.mockResolvedValue({ currentStreak: 6, longestStreak: 10, atRisk: true, repairEligible: true, repairUsedThisMonth: false });
    mock.streaks.repairStreak.mockResolvedValue({ currentStreak: 7, longestStreak: 10, atRisk: false, repairEligible: false, repairUsedThisMonth: false });
    await render(<StreakSheet open onClose={jest.fn()} workspaceId="w1" />);
    await waitFor(() => expect(screen.getByTestId('streak-repair')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('streak-repair'));
    await waitFor(() => expect(mock.streaks.repairStreak).toHaveBeenCalledWith('w1'));
    expect(mockAuthState.setStreak).toHaveBeenCalledWith(7, 10);
  });

  it('disables repair when the streak is missed and XP is short', async () => {
    mock.gamification.getXpSummary.mockResolvedValue({ balance: 3, totalEarned: 100, todayEarned: 0 });
    mock.streaks.getStreakStatus.mockResolvedValue({ currentStreak: 6, longestStreak: 10, atRisk: true, repairEligible: true, repairUsedThisMonth: false });
    await render(<StreakSheet open onClose={jest.fn()} workspaceId="w1" />);
    await waitFor(() => expect(screen.getByTestId('streak-repair-disabled')).toBeTruthy());
    expect(screen.getByText(/more XP to recover/)).toBeTruthy();
  });

  it('captures the card and opens the share sheet', async () => {
    mock.streaks.getStreakStatus.mockResolvedValue({ currentStreak: 7, longestStreak: 10, atRisk: false, repairEligible: false, repairUsedThisMonth: false });
    await render(<StreakSheet open onClose={jest.fn()} workspaceId="w1" />);
    await waitFor(() => expect(screen.getByTestId('streak-share')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('streak-share'));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledWith('file://card.png'));
  });

  it('shows an error with retry when the fetch fails', async () => {
    mock.streaks.getStreakStatus.mockRejectedValue(new Error('nope'));
    await render(<StreakSheet open onClose={jest.fn()} workspaceId="w1" />);
    await waitFor(() => expect(screen.getByText('Retry')).toBeTruthy());
  });

  it('navigates to the streaks screen and closes from "See full history"', async () => {
    mockPush.mockReset();
    const onClose = jest.fn();
    mock.streaks.getStreakStatus.mockResolvedValue({ currentStreak: 7, longestStreak: 10, atRisk: false, repairEligible: false, repairUsedThisMonth: false });
    await render(<StreakSheet open onClose={onClose} workspaceId="w1" />);
    await waitFor(() => expect(screen.getByText('See full history →')).toBeTruthy());
    await fireEvent.press(screen.getByText('See full history →'));
    expect(mockPush).toHaveBeenCalledWith('/streaks');
    expect(onClose).toHaveBeenCalled();
  });
});
