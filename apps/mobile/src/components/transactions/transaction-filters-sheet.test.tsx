// apps/mobile/src/components/transactions/transaction-filters-sheet.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import type { Category } from '@finby/shared';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
// Mock Ionicons to render its `name` as text so we can assert which glyph shows
// (same pattern as category-avatar.test.tsx).
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));

import { TransactionFiltersSheet } from './transaction-filters-sheet';

const categories: Category[] = [
  { id: 'c1', name: 'Dining', isArchived: false, icon: 'cart', color: '#1A7A4A' },
];

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

  it('shows a branded category avatar in the category dropdown', async () => {
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
    fireEvent.press(screen.getByLabelText(/Filter by category/));
    expect(screen.getByText('cart', { includeHiddenElements: true })).toBeTruthy();
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
