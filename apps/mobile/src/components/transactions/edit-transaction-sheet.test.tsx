import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import type { Transaction, Category } from '@finby/shared';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../lib/runtime.native', () => ({
  api: { transactions: { updateTransaction: jest.fn(), voidTransaction: jest.fn() } },
}));

import { api } from '../../lib/runtime.native';
import { EditTransactionSheet } from './edit-transaction-sheet';

const txns = api.transactions as unknown as {
  updateTransaction: jest.Mock;
  voidTransaction: jest.Mock;
};

const tx: Transaction = {
  id: 't1', type: 'EXPENSE', status: 'CONFIRMED', amountOriginal: '11.08', currencyOriginal: 'USD',
  amountBase: '11.08', currencyBase: 'USD', fxRateUsed: '1', merchant: 'Pizza Hut', description: null,
  category: { id: 'c1', name: 'Dining', icon: null, color: null }, account: null, transactionDate: '2026-06-24T10:00:00.000Z',
  tags: [], aiConfidence: null, loggedByUserId: 'u1', createdAt: '2026-06-24T10:00:00.000Z',
};
const categories: Category[] = [{ id: 'c1', name: 'Dining', isArchived: false }];

beforeEach(() => {
  txns.updateTransaction.mockReset().mockResolvedValue({ ...tx, merchant: 'Pizza Place' });
  txns.voidTransaction.mockReset().mockResolvedValue({ message: 'ok' });
});

describe('EditTransactionSheet', () => {
  it('saves a patch and reports the updated transaction', async () => {
    const onSaved = jest.fn();
    await render(
      <EditTransactionSheet
        open workspaceId="w1" transaction={tx} categories={categories}
        onSaved={onSaved} onVoided={jest.fn()} onClose={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(txns.updateTransaction).toHaveBeenCalledWith('w1', 't1', expect.objectContaining({
      categoryId: 'c1', merchant: 'Pizza Hut', description: null, transactionDate: '2026-06-24', tags: [],
    })));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('voids after confirmation', async () => {
    const onVoided = jest.fn();
    await render(
      <EditTransactionSheet
        open workspaceId="w1" transaction={tx} categories={categories}
        onSaved={jest.fn()} onVoided={onVoided} onClose={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByText('Void'));
    await waitFor(() => screen.getByText('Confirm void'));
    fireEvent.press(screen.getByText('Confirm void'));
    await waitFor(() => expect(txns.voidTransaction).toHaveBeenCalledWith('w1', 't1'));
    await waitFor(() => expect(onVoided).toHaveBeenCalledWith('t1'));
  });
});
