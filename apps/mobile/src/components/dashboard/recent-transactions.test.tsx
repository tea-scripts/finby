import { render, screen } from '@testing-library/react-native';
import type { Transaction } from '@finby/shared';
import { RecentTransactions } from './recent-transactions';

const tx: Transaction = {
  id: 't1',
  type: 'EXPENSE',
  status: 'CONFIRMED',
  amountOriginal: '20.00',
  currencyOriginal: 'USD',
  amountBase: '20.00',
  currencyBase: 'USD',
  fxRateUsed: '1',
  merchant: 'Coffee Shop',
  description: null,
  category: { id: 'c1', name: 'Food', icon: null, color: null },
  account: { id: 'a1', name: 'Cash' },
  transactionDate: '2026-06-20T10:00:00.000Z',
  tags: [],
  aiConfidence: null,
  loggedByUserId: 'u1',
  createdAt: '2026-06-20T10:00:00.000Z',
};

describe('RecentTransactions', () => {
  it('renders a transaction row', async () => {
    await render(<RecentTransactions state={{ data: [tx], loading: false, error: null }} onRetry={jest.fn()} />);
    expect(screen.getByText('Coffee Shop')).toBeTruthy();
    expect(screen.getByText('−$20.00')).toBeTruthy();
  });

  it('renders empty state', async () => {
    await render(<RecentTransactions state={{ data: [], loading: false, error: null }} onRetry={jest.fn()} />);
    expect(screen.getByText('No transactions yet.')).toBeTruthy();
  });

  it('renders error with retry', async () => {
    await render(<RecentTransactions state={{ data: null, loading: false, error: 'x' }} onRetry={jest.fn()} />);
    expect(screen.getByTestId('section-retry')).toBeTruthy();
  });
});
