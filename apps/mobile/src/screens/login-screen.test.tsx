// apps/mobile/src/screens/login-screen.test.tsx
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';

const mockFns = { login: jest.fn() };
jest.mock('../lib/use-auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector(mockFns),
}));
jest.mock('expo-router', () => ({
  Link: () => null,
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { LoginScreen } from './login-screen';

describe('LoginScreen', () => {
  beforeEach(() => mockFns.login.mockReset());

  it('shows an error and does not call login when fields are empty', async () => {
    await render(<LoginScreen />);
    await fireEvent.press(screen.getByText('Sign in'));
    expect(screen.getByText('Enter your email and password.')).toBeTruthy();
    expect(mockFns.login).not.toHaveBeenCalled();
  });

  it('calls login with trimmed email + password', async () => {
    mockFns.login.mockResolvedValueOnce(undefined);
    await render(<LoginScreen />);
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('email'), '  me@x.com ');
      fireEvent.changeText(screen.getByTestId('password'), 'secret123');
    });
    fireEvent.press(screen.getByText('Sign in'));
    await waitFor(() => expect(mockFns.login).toHaveBeenCalledWith('me@x.com', 'secret123'));
  });
});
