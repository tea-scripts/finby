// apps/mobile/src/screens/forgot-password-screen.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockFns = { forgotPassword: jest.fn() };
jest.mock('../lib/runtime.native', () => ({
  api: { auth: { forgotPassword: (...args: unknown[]) => mockFns.forgotPassword(...args) } },
}));
jest.mock('expo-router', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Link: ({ children }: { children: React.ReactNode }) => require('react').createElement('Text', null, children),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { ForgotPasswordScreen } from './forgot-password-screen';

describe('ForgotPasswordScreen', () => {
  beforeEach(() => mockFns.forgotPassword.mockReset());

  it('submits the trimmed email and shows the generic confirmation', async () => {
    mockFns.forgotPassword.mockResolvedValueOnce({ message: 'ok' });
    await render(<ForgotPasswordScreen />);
    await fireEvent.changeText(screen.getByTestId('fp-email'), '  me@x.com ');
    await fireEvent.press(screen.getByText('Send reset link'));
    await waitFor(() => expect(mockFns.forgotPassword).toHaveBeenCalledWith('me@x.com'));
    expect(screen.getByText(/reset link is on its way/i)).toBeTruthy();
  });

  it('still shows the confirmation when the request fails', async () => {
    mockFns.forgotPassword.mockRejectedValueOnce(new Error('network'));
    await render(<ForgotPasswordScreen />);
    await fireEvent.changeText(screen.getByTestId('fp-email'), 'me@x.com');
    await fireEvent.press(screen.getByText('Send reset link'));
    await waitFor(() => expect(screen.getByText(/reset link is on its way/i)).toBeTruthy());
  });
});
