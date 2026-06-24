import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockState = {
  user: { displayName: 'Tee' },
  verifyPin: jest.fn(),
  unlock: jest.fn(),
  logout: jest.fn(),
};
jest.mock('../lib/use-auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector(mockState),
}));
const mockAuthenticate = jest.fn();
jest.mock('../lib/runtime.native', () => ({ biometric: { authenticate: () => mockAuthenticate() } }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { UnlockScreen } from './unlock-screen';

async function enter(pin: string) {
  for (const d of pin) await fireEvent.press(screen.getByTestId(`pin-key-${d}`));
}

describe('UnlockScreen', () => {
  beforeEach(() => {
    mockState.verifyPin.mockReset();
    mockState.unlock.mockReset();
    mockState.logout.mockReset();
    mockAuthenticate.mockReset().mockResolvedValue(false);
  });

  it('auto-prompts biometrics on mount', async () => {
    await render(<UnlockScreen />);
    await waitFor(() => expect(mockAuthenticate).toHaveBeenCalled());
  });

  it('unlocks when biometrics succeed', async () => {
    mockAuthenticate.mockResolvedValue(true);
    await render(<UnlockScreen />);
    await waitFor(() => expect(mockState.unlock).toHaveBeenCalled());
  });

  it('unlocks on the correct PIN', async () => {
    mockState.verifyPin.mockResolvedValue(true);
    await render(<UnlockScreen />);
    await enter('1234');
    await waitFor(() => expect(mockState.verifyPin).toHaveBeenCalledWith('1234'));
    await waitFor(() => expect(mockState.unlock).toHaveBeenCalled());
  });

  it('shows an error on a wrong PIN and does not unlock', async () => {
    mockState.verifyPin.mockResolvedValue(false);
    await render(<UnlockScreen />);
    await enter('0000');
    await waitFor(() => expect(screen.getByText('Wrong PIN. Try again.')).toBeTruthy());
    expect(mockState.unlock).not.toHaveBeenCalled();
  });

  it('signs out from "Switch account"', async () => {
    await render(<UnlockScreen />);
    await fireEvent.press(screen.getByTestId('unlock-switch'));
    expect(mockState.logout).toHaveBeenCalled();
  });
});
