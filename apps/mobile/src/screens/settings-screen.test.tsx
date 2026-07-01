// apps/mobile/src/screens/settings-screen.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockAuthState = {
  user: { displayName: 'Tee', currentStreak: 7 },
  workspace: { id: 'w1', tier: 'FREE' },
  logout: jest.fn(),
  resetOnboarding: jest.fn(),
  lockEnabled: false,
  setLockEnabled: jest.fn(),
};
jest.mock('../lib/use-auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector(mockAuthState),
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-blur', () => ({ BlurView: ({ children }: { children: unknown }) => children }));
jest.mock('../lib/runtime.native', () => ({
  api: { billing: { getSubscription: jest.fn(), openPortal: jest.fn() } },
}));

import { SettingsScreen } from './settings-screen';
import { api } from '../lib/runtime.native';

const billing = api.billing as unknown as { getSubscription: jest.Mock; openPortal: jest.Mock };
const FREE_SUB = {
  tier: 'FREE',
  status: 'ACTIVE',
  billingProvider: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  pendingTier: null,
  pendingTierEffectiveAt: null,
};

beforeEach(() => {
  mockPush.mockReset();
  billing.getSubscription.mockReset().mockResolvedValue(FREE_SUB);
  billing.openPortal.mockReset();
});

describe('SettingsScreen', () => {
  it('opens the streaks screen from the streak row', async () => {
    await render(<SettingsScreen />);
    await fireEvent.press(screen.getByLabelText('View your streak progress'));
    expect(mockPush).toHaveBeenCalledWith('/streaks');
  });

  it('shows the inline current plan and opens the carousel from the plan CTA', async () => {
    await render(<SettingsScreen />);
    await waitFor(() => expect(screen.getByText('Free')).toBeTruthy());
    // No navigation row anymore
    expect(screen.queryByLabelText('Plan and billing')).toBeNull();
    // Opening the carousel reveals all tiers
    await fireEvent.press(screen.getByText('Upgrade to Pro'));
    await waitFor(() => expect(screen.getByText('Premium')).toBeTruthy());
  });
});
