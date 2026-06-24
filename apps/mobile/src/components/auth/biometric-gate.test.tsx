import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

const mockState = {
  status: 'authed' as string,
  lockEnabled: true,
  locked: false,
  unlock: jest.fn(),
  lockNow: jest.fn(),
};
jest.mock('../../lib/use-auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector(mockState),
}));
const mockAuthenticate = jest.fn();
jest.mock('../../lib/runtime.native', () => ({
  biometric: { authenticate: () => mockAuthenticate() },
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { BiometricGate } from './biometric-gate';

const Child = () => <Text>APP CONTENT</Text>;

describe('BiometricGate', () => {
  beforeEach(() => {
    mockState.status = 'authed';
    mockState.lockEnabled = true;
    mockState.locked = false;
    mockState.unlock.mockReset();
    mockState.lockNow.mockReset();
    mockAuthenticate.mockReset();
  });

  it('renders app content when unlocked', async () => {
    await render(
      <BiometricGate>
        <Child />
      </BiometricGate>,
    );
    expect(screen.getByText('APP CONTENT')).toBeTruthy();
    expect(mockAuthenticate).not.toHaveBeenCalled();
  });

  it('hides app content and shows the lock screen when locked', async () => {
    mockState.locked = true;
    mockAuthenticate.mockResolvedValue(false);
    await render(
      <BiometricGate>
        <Child />
      </BiometricGate>,
    );
    expect(screen.queryByText('APP CONTENT')).toBeNull();
    expect(screen.getByText('Finby is locked')).toBeTruthy();
  });

  it('auto-prompts biometrics when locked and unlocks on success', async () => {
    mockState.locked = true;
    mockAuthenticate.mockResolvedValue(true);
    await render(
      <BiometricGate>
        <Child />
      </BiometricGate>,
    );
    await waitFor(() => expect(mockAuthenticate).toHaveBeenCalled());
    await waitFor(() => expect(mockState.unlock).toHaveBeenCalled());
  });

  it('does not prompt or lock when the lock is disabled', async () => {
    mockState.lockEnabled = false;
    await render(
      <BiometricGate>
        <Child />
      </BiometricGate>,
    );
    expect(mockAuthenticate).not.toHaveBeenCalled();
    expect(screen.getByText('APP CONTENT')).toBeTruthy();
  });

  it('re-prompts when the Unlock button is pressed', async () => {
    mockState.locked = true;
    mockAuthenticate.mockResolvedValue(false);
    await render(
      <BiometricGate>
        <Child />
      </BiometricGate>,
    );
    await waitFor(() => expect(mockAuthenticate).toHaveBeenCalledTimes(1)); // auto-prompt resolved false
    mockAuthenticate.mockResolvedValueOnce(true);
    await fireEvent.press(screen.getByText('Unlock'));
    await waitFor(() => expect(mockState.unlock).toHaveBeenCalled());
  });
});
