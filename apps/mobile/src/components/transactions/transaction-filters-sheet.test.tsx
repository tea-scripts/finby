// apps/mobile/src/components/transactions/transaction-filters-sheet.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import type { Category } from '@finby/shared';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { TransactionFiltersSheet } from './transaction-filters-sheet';

const categories: Category[] = [{ id: 'c1', name: 'Dining', isArchived: false }];

describe('TransactionFiltersSheet', () => {
  it('applies the current draft (preserving type)', async () => {
    const onApply = jest.fn();
    await render(
      <TransactionFiltersSheet
        open
        onClose={jest.fn()}
        filters={{ type: 'EXPENSE', categoryId: 'c1' }}
        categories={categories}
        preferredCurrencies={['USD']}
        onApply={onApply}
      />,
    );
    fireEvent.press(screen.getByText('Apply'));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ type: 'EXPENSE', categoryId: 'c1' }));
  });

  it('reset clears the non-type filters', async () => {
    const onApply = jest.fn();
    await render(
      <TransactionFiltersSheet
        open
        onClose={jest.fn()}
        filters={{ type: 'EXPENSE', categoryId: 'c1', currency: 'USD' }}
        categories={categories}
        preferredCurrencies={['USD']}
        onApply={onApply}
      />,
    );
    fireEvent.press(screen.getByText('Reset'));
    expect(onApply).toHaveBeenCalledWith({ type: 'EXPENSE' });
  });
});
