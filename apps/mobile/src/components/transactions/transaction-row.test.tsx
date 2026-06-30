import { render, screen, fireEvent } from '@testing-library/react-native';
import type { Transaction } from '@finby/shared';
import { TransactionRow } from './transaction-row';

const tx: Transaction = {
  id: 't1', type: 'EXPENSE', status: 'CONFIRMED', amountOriginal: '11.08', currencyOriginal: 'USD',
  amountBase: '11.08', currencyBase: 'USD', fxRateUsed: '1', merchant: 'Pizza Hut', description: null,
  category: { id: 'c1', name: 'Dining' }, account: null, transactionDate: '2026-06-24T10:00:00.000Z',
  tags: ['weekly'], aiConfidence: null, loggedByUserId: 'u1', createdAt: '2026-06-24T10:00:00.000Z',
};

describe('TransactionRow', () => {
  it('renders merchant, category, amount and fires onPress', async () => {
    const onPress = jest.fn();
    await render(<TransactionRow tx={tx} onPress={onPress} />);
    expect(screen.getByText('Pizza Hut')).toBeTruthy();
    expect(screen.getByText('Dining')).toBeTruthy();
    expect(screen.getByText('−$11.08')).toBeTruthy();
    fireEvent.press(screen.getByText('Pizza Hut'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
