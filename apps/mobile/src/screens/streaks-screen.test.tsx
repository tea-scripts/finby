// apps/mobile/src/screens/streaks-screen.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const authState = { workspace: { id: 'w1' } };
jest.mock('../lib/use-auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector(authState),
}));
jest.mock('../lib/runtime.native', () => ({
  api: {
    streaks: { getStreakStatus: jest.fn(), getStreakCalendar: jest.fn() },
    gamification: { getXpSummary: jest.fn(), getAchievements: jest.fn(), getXpHistory: jest.fn(), getBadgeSvg: jest.fn(async () => '<svg/>') },
  },
}));
const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack, push: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-blur', () => ({ BlurView: ({ children }: { children: unknown }) => children }));
jest.mock('react-native-svg', () => ({ SvgXml: () => null }));

import { api } from '../lib/runtime.native';
import { StreaksScreen } from './streaks-screen';

const mock = api as unknown as {
  streaks: { getStreakStatus: jest.Mock; getStreakCalendar: jest.Mock };
  gamification: { getXpSummary: jest.Mock; getAchievements: jest.Mock; getXpHistory: jest.Mock };
};

beforeEach(() => {
  mockBack.mockReset();
  mock.streaks.getStreakStatus.mockReset().mockResolvedValue({ currentStreak: 7, longestStreak: 30, atRisk: false, repairEligible: false, repairUsedThisMonth: false });
  mock.streaks.getStreakCalendar.mockReset().mockResolvedValue({ from: '2026-01-01', to: '2026-06-30', activeDays: ['2026-06-29', '2026-06-30'], repairedDays: [] });
  mock.gamification.getXpSummary.mockReset().mockResolvedValue({ balance: 40, totalEarned: 1250, todayEarned: 10 });
  mock.gamification.getAchievements.mockReset().mockResolvedValue({ unlocked: [], locked: [] });
  mock.gamification.getXpHistory.mockReset().mockResolvedValue([{ id: '1', event: 'TRANSACTION_LOGGED', delta: 5, meta: null, createdAt: '2026-06-30T11:00:00Z' }]);
});

describe('StreaksScreen', () => {
  it('loads and shows the overview, stats and XP history', async () => {
    await render(<StreaksScreen />);
    await waitFor(() => expect(screen.getByText('Total days logged')).toBeTruthy());
    expect(screen.getByText('7')).toBeTruthy();          // current streak hero
    expect(screen.getByText('2')).toBeTruthy();          // days logged tile (2 distinct active days)
    expect(screen.getByText('Transaction logged')).toBeTruthy();
  });

  it('goes back when the back button is pressed', async () => {
    await render(<StreaksScreen />);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('shows a section error + retry when the streak group fails', async () => {
    mock.streaks.getStreakStatus.mockRejectedValue(new Error('nope'));
    await render(<StreaksScreen />);
    await waitFor(() => expect(screen.getAllByTestId('section-retry').length).toBeGreaterThan(0));
  });
});
