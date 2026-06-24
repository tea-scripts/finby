import { render, screen } from '@testing-library/react-native';
import type { AccountView } from '@finby/shared';
import { AccountCarousel } from './account-carousel';

const acct: AccountView = {
  id: 'a1',
  name: 'Cash',
  currency: 'USD',
  accountType: 'CASH',
  balance: '1500.00',
  color: '#1fae6a',
  icon: null,
  isArchived: false,
};

describe('AccountCarousel', () => {
  it('renders an account card with name and balance', async () => {
    await render(<AccountCarousel state={{ data: [acct], loading: false, error: null }} onRetry={jest.fn()} />);
    expect(screen.getByText('Cash')).toBeTruthy();
    expect(screen.getByText('$1,500.00')).toBeTruthy();
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
});
