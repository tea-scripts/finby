// apps/mobile/src/screens/subscription-screen.test.tsx
import { Linking } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const authState = { workspace: { id: 'w1' } };
jest.mock('../lib/use-auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector(authState),
}));
jest.mock('../lib/runtime.native', () => ({
  api: { billing: { getSubscription: jest.fn(), openPortal: jest.fn() } },
}));
const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack, push: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-blur', () => ({ BlurView: ({ children }: { children: unknown }) => children }));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));

import { api } from '../lib/runtime.native';
import { SubscriptionScreen } from './subscription-screen';

const billing = api.billing as unknown as { getSubscription: jest.Mock; openPortal: jest.Mock };
const FREE = { tier: 'FREE', status: 'ACTIVE', billingProvider: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, pendingTier: null, pendingTierEffectiveAt: null };
const PRO = { ...FREE, tier: 'PRO', billingProvider: 'STRIPE', currentPeriodEnd: '2026-08-01T00:00:00Z' };

beforeEach(() => {
  mockBack.mockReset();
  billing.getSubscription.mockReset();
  billing.openPortal.mockReset().mockResolvedValue({ url: 'https://portal.stripe/x' });
});

describe('SubscriptionScreen', () => {
  it('FREE: Upgrade opens the web billing page', async () => {
    const spy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    billing.getSubscription.mockResolvedValue(FREE);
    await render(<SubscriptionScreen />);
    await waitFor(() => expect(screen.getByText('Upgrade')).toBeTruthy());
    await fireEvent.press(screen.getByText('Upgrade'));
    expect(spy).toHaveBeenCalledWith('https://chat.finby.app/settings');
    spy.mockRestore();
  });

  it('paid: Manage billing opens the Stripe portal url', async () => {
    const spy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    billing.getSubscription.mockResolvedValue(PRO);
    await render(<SubscriptionScreen />);
    await waitFor(() => expect(screen.getByText('Manage billing')).toBeTruthy());
    await fireEvent.press(screen.getByText('Manage billing'));
    await waitFor(() => expect(billing.openPortal).toHaveBeenCalledWith('w1'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith('https://portal.stripe/x'));
    spy.mockRestore();
  });

  it('shows an error + retry when the subscription fails to load', async () => {
    billing.getSubscription.mockRejectedValue(new Error('nope'));
    await render(<SubscriptionScreen />);
    await waitFor(() => expect(screen.getByTestId('section-retry')).toBeTruthy());
  });

  it('goes back from the header', async () => {
    billing.getSubscription.mockResolvedValue(FREE);
    await render(<SubscriptionScreen />);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
