// apps/mobile/src/screens/settings-screen.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';

const mockAuthState = { user: { displayName: 'Tee', currentStreak: 7 }, logout: jest.fn(), resetOnboarding: jest.fn(), lockEnabled: false, setLockEnabled: jest.fn() };
jest.mock('../lib/use-auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector(mockAuthState),
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { SettingsScreen } from './settings-screen';

beforeEach(() => {
  mockPush.mockReset();
});

describe('SettingsScreen', () => {
  it('opens the streaks screen from the streak row', async () => {
    await render(<SettingsScreen />);
    await fireEvent.press(screen.getByLabelText('View your streak progress'));
    expect(mockPush).toHaveBeenCalledWith('/streaks');
  });

  it('opens the subscription screen from the plan row', async () => {
    await render(<SettingsScreen />);
    await fireEvent.press(screen.getByLabelText('Plan and billing'));
    expect(mockPush).toHaveBeenCalledWith('/subscription');
  });
});
