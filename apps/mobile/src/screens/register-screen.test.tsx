// apps/mobile/src/screens/register-screen.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockFns = { register: jest.fn() };
jest.mock('../lib/use-auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector(mockFns),
}));
jest.mock('expo-router', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Link: ({ children }: { children: React.ReactNode }) => require('react').createElement('Text', null, children),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../adapters/localization.native', () => ({ getDeviceTimeZone: () => 'UTC' }));

import { RegisterScreen } from './register-screen';

async function fill() {
  await fireEvent.changeText(screen.getByTestId('displayName'), 'Tee');
  await fireEvent.changeText(screen.getByTestId('email'), '  me@x.com ');
  await fireEvent.changeText(screen.getByTestId('password'), 'secret123');
}

describe('RegisterScreen', () => {
  beforeEach(() => mockFns.register.mockReset());

  it('requires a display name', async () => {
    await render(<RegisterScreen />);
    await fireEvent(screen.getByLabelText('Accept terms'), 'valueChange', true);
    await fireEvent.press(screen.getByText('Create account'));
    expect(screen.getByText('What should Finby call you?')).toBeTruthy();
    expect(mockFns.register).not.toHaveBeenCalled();
  });

  it('rejects passwords shorter than 8 characters', async () => {
    await render(<RegisterScreen />);
    await fireEvent.changeText(screen.getByTestId('displayName'), 'Tee');
    await fireEvent.changeText(screen.getByTestId('email'), 'me@x.com');
    await fireEvent.changeText(screen.getByTestId('password'), 'short');
    await fireEvent(screen.getByLabelText('Accept terms'), 'valueChange', true);
    await fireEvent.press(screen.getByText('Create account'));
    expect(screen.getByText('Password must be at least 8 characters.')).toBeTruthy();
    expect(mockFns.register).not.toHaveBeenCalled();
  });

  it('registers with the full payload (default USD currency, device timezone)', async () => {
    mockFns.register.mockResolvedValueOnce(undefined);
    await render(<RegisterScreen />);
    await fill();
    await fireEvent(screen.getByLabelText('Accept terms'), 'valueChange', true);
    await fireEvent.press(screen.getByText('Create account'));
    await waitFor(() =>
      expect(mockFns.register).toHaveBeenCalledWith({
        displayName: 'Tee',
        email: 'me@x.com',
        password: 'secret123',
        baseCurrency: 'USD',
        timezone: 'UTC',
      }),
    );
  });
});
