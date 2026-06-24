import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

const mockState = {
  status: 'authed' as string,
  lockEnabled: true,
  hasPin: true,
  locked: false,
  user: { displayName: 'Tee' },
  lockNow: jest.fn(),
  setPin: jest.fn(),
  verifyPin: jest.fn(async () => false),
  unlock: jest.fn(),
  logout: jest.fn(),
};
jest.mock('../../lib/use-auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector(mockState),
}));
jest.mock('../../lib/runtime.native', () => ({ biometric: { authenticate: async () => false } }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { AppLockGate } from './app-lock-gate';

const Child = () => <Text>APP CONTENT</Text>;

describe('AppLockGate', () => {
  beforeEach(() => {
    mockState.status = 'authed';
    mockState.lockEnabled = true;
    mockState.hasPin = true;
    mockState.locked = false;
  });

  it('renders the app when unlocked', async () => {
    await render(<AppLockGate><Child /></AppLockGate>);
    expect(screen.getByText('APP CONTENT')).toBeTruthy();
  });

  it('forces PIN setup when the lock is on but no PIN is set', async () => {
    mockState.hasPin = false;
    await render(<AppLockGate><Child /></AppLockGate>);
    expect(screen.getByText('Set your unlock PIN')).toBeTruthy();
    expect(screen.queryByText('APP CONTENT')).toBeNull();
  });

  it('shows the unlock screen when locked', async () => {
    mockState.locked = true;
    await render(<AppLockGate><Child /></AppLockGate>);
    expect(screen.getByText('Welcome back, Tee')).toBeTruthy();
    expect(screen.queryByText('APP CONTENT')).toBeNull();
  });

  it('renders the app when the lock is disabled', async () => {
    mockState.lockEnabled = false;
    mockState.locked = true;
    await render(<AppLockGate><Child /></AppLockGate>);
    expect(screen.getByText('APP CONTENT')).toBeTruthy();
  });
});
