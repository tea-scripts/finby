// apps/mobile/src/screens/transactions-screen.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import type { Transaction } from '@finby/shared';

const authState = { workspace: { id: 'w1', preferredCurrencies: ['USD'] } };
jest.mock('../lib/use-auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector(authState),
}));
jest.mock('../lib/runtime.native', () => ({
  api: { transactions: { listTransactions: jest.fn(), listCategories: jest.fn(), updateTransaction: jest.fn(), voidTransaction: jest.fn() } },
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-blur', () => ({
  BlurView: ({ children }: { children: unknown }) => children,
}));

import { api } from '../lib/runtime.native';
import { TransactionsScreen } from './transactions-screen';

const txns = api.transactions as unknown as {
  listTransactions: jest.Mock;
  listCategories: jest.Mock;
};

function tx(id: string, date: string, merchant: string): Transaction {
  return {
    id, type: 'EXPENSE', status: 'CONFIRMED', amountOriginal: '5.00', currencyOriginal: 'USD',
    amountBase: '5.00', currencyBase: 'USD', fxRateUsed: '1', merchant, description: null,
    category: null, account: null, transactionDate: date, tags: [], aiConfidence: null,
    loggedByUserId: 'u1', createdAt: date,
  };
}

beforeEach(() => {
  txns.listCategories.mockReset().mockResolvedValue([]);
  txns.listTransactions.mockReset().mockResolvedValue({
    transactions: [tx('a', '2026-06-24T10:00:00.000Z', 'Pizza Hut')],
    nextCursor: null,
    hasMore: false,
  });
});

describe('TransactionsScreen', () => {
  it('loads and renders transactions', async () => {
    await render(<TransactionsScreen />);
    await waitFor(() => expect(screen.getByText('Pizza Hut')).toBeTruthy());
    expect(txns.listTransactions).toHaveBeenCalled();
  });

  it('reloads with a type filter when the segment changes', async () => {
    await render(<TransactionsScreen />);
    await waitFor(() => expect(screen.getByText('Pizza Hut')).toBeTruthy());
    fireEvent.press(screen.getByTestId('segment-INCOME'));
    await waitFor(() =>
      expect(txns.listTransactions).toHaveBeenLastCalledWith('w1', expect.objectContaining({ type: 'INCOME' })),
    );
  });

  it('shows the empty state when there are no transactions', async () => {
    txns.listTransactions.mockResolvedValue({ transactions: [], nextCursor: null, hasMore: false });
    await render(<TransactionsScreen />);
    await waitFor(() => expect(screen.getByText(/No transactions/)).toBeTruthy());
  });

  it('appends on end-reached', async () => {
    txns.listTransactions.mockReset();
    txns.listTransactions
      .mockResolvedValueOnce({ transactions: [tx('a', '2026-06-24T10:00:00.000Z', 'Pizza Hut')], nextCursor: 'c1', hasMore: true })
      .mockResolvedValueOnce({ transactions: [tx('b', '2026-06-23T10:00:00.000Z', 'Coffee')], nextCursor: null, hasMore: false });
    await render(<TransactionsScreen />);
    await waitFor(() => expect(screen.getByText('Pizza Hut')).toBeTruthy());
    fireEvent(screen.getByTestId('tx-list'), 'endReached');
    await waitFor(() => expect(screen.getByText('Coffee')).toBeTruthy());
    expect(screen.getByText('Pizza Hut')).toBeTruthy();
  });

  it('pagination error keeps the list', async () => {
    txns.listTransactions.mockReset();
    txns.listTransactions
      .mockResolvedValueOnce({ transactions: [tx('a', '2026-06-24T10:00:00.000Z', 'Pizza Hut')], nextCursor: 'c1', hasMore: true })
      .mockRejectedValueOnce(new Error('boom'));
    await render(<TransactionsScreen />);
    await waitFor(() => expect(screen.getByText('Pizza Hut')).toBeTruthy());
    fireEvent(screen.getByTestId('tx-list'), 'endReached');
    await waitFor(() => expect(screen.getByTestId('load-more-retry')).toBeTruthy());
    expect(screen.getByText('Pizza Hut')).toBeTruthy();
  });
});
