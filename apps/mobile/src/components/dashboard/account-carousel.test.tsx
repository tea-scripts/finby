import { render, screen } from '@testing-library/react-native';
import type { AccountView } from '@finby/shared';

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: unknown }) => children,
}));

import { AccountCarousel } from './account-carousel';

const acct: AccountView = {
  id: 'a1',
  name: 'Cash',
  currency: 'USD',
  accountType: 'BANK',
  balance: '1500.00',
  color: '#1fae6a',
  icon: null,
  isArchived: false,
};

describe('AccountCarousel', () => {
  it('renders an account card with balance, currency and name · type', async () => {
    await render(<AccountCarousel state={{ data: [acct], loading: false, error: null }} onRetry={jest.fn()} />);
    expect(screen.getByText('$1,500.00')).toBeTruthy();
    expect(screen.getByText('USD')).toBeTruthy();
    expect(screen.getByText('Cash · Bank')).toBeTruthy();
  });

  it('excludes archived accounts', async () => {
    const archived = { ...acct, id: 'a2', name: 'Old', isArchived: true };
    await render(
      <AccountCarousel state={{ data: [archived], loading: false, error: null }} onRetry={jest.fn()} />,
    );
    expect(screen.getByText('No accounts yet.')).toBeTruthy();
  });

  it('renders error with retry', async () => {
    await render(<AccountCarousel state={{ data: null, loading: false, error: 'x' }} onRetry={jest.fn()} />);
    expect(screen.getByTestId('section-retry')).toBeTruthy();
  });

  it('renders a paging dot per account when there is more than one', async () => {
    const second = { ...acct, id: 'a2', name: 'Wise USD', balance: '379.32' };
    await render(
      <AccountCarousel state={{ data: [acct, second], loading: false, error: null }} onRetry={jest.fn()} />,
    );
    expect(screen.getByText('Cash · Bank')).toBeTruthy();
    expect(screen.getByText('Wise USD · Bank')).toBeTruthy();
    expect(screen.getByTestId('account-dot-0')).toBeTruthy();
    expect(screen.getByTestId('account-dot-1')).toBeTruthy();
  });
});
