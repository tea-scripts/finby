// apps/mobile/src/screens/onboarding-screen.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';

const mockFns = { completeOnboarding: jest.fn() };
jest.mock('../lib/use-auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector(mockFns),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('lottie-react-native', () => 'LottieView');

import { OnboardingScreen } from './onboarding-screen';

describe('OnboardingScreen', () => {
  beforeEach(() => mockFns.completeOnboarding.mockReset());

  it('shows the first slide and a Next button', async () => {
    await render(<OnboardingScreen />);
    expect(screen.getByText('Track money by chatting')).toBeTruthy();
    expect(screen.getByText('Next')).toBeTruthy();
  });

  it('hides Back on the first slide and shows it after advancing', async () => {
    await render(<OnboardingScreen />);
    expect(screen.queryByText('Back')).toBeNull();
    await fireEvent.press(screen.getByText('Next'));
    expect(screen.getByText('Back')).toBeTruthy();
    await fireEvent.press(screen.getByText('Back'));
    expect(screen.queryByText('Back')).toBeNull();
  });

  it('advances through slides and finishes on the last', async () => {
    await render(<OnboardingScreen />);
    await fireEvent.press(screen.getByText('Next')); // slide 2
    await fireEvent.press(screen.getByText('Next')); // slide 3
    expect(screen.getByText('Get started')).toBeTruthy();
    await fireEvent.press(screen.getByText('Get started'));
    expect(mockFns.completeOnboarding).toHaveBeenCalledTimes(1);
  });
});
