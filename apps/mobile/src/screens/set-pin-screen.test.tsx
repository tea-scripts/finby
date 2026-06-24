import { render, screen, fireEvent } from '@testing-library/react-native';

const mockSetPin = jest.fn();
jest.mock('../lib/use-auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector({ setPin: mockSetPin }),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { SetPinScreen } from './set-pin-screen';

async function enter(pin: string) {
  for (const d of pin) await fireEvent.press(screen.getByTestId(`pin-key-${d}`));
}

describe('SetPinScreen', () => {
  beforeEach(() => mockSetPin.mockReset());

  it('saves the PIN when entry and confirmation match', async () => {
    await render(<SetPinScreen />);
    await enter('1234');
    expect(screen.getByText('Confirm your PIN')).toBeTruthy();
    await enter('1234');
    expect(mockSetPin).toHaveBeenCalledWith('1234');
  });

  it('shows an error and restarts when the confirmation does not match', async () => {
    await render(<SetPinScreen />);
    await enter('1234');
    await enter('5678');
    expect(mockSetPin).not.toHaveBeenCalled();
    expect(screen.getByText(/didn’t match/)).toBeTruthy();
    expect(screen.getByText('Set your unlock PIN')).toBeTruthy();
  });
});
