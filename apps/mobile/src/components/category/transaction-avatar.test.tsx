import { render, screen } from '@testing-library/react-native';
import type { Transaction } from '@finby/shared';
import { TransactionAvatar } from './transaction-avatar';

// Mock Ionicons to render its `name` as text so we can assert which glyph shows
// (same pattern as category-avatar.test.tsx / tab-bar-icon.test.tsx).
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));

// Avatars are `accessibilityElementsHidden` (decorative), so queries opt into hidden.
const HIDDEN = { includeHiddenElements: true };

function mkTx(over: Partial<Transaction>): Transaction {
  return {
    id: 't1',
    type: 'EXPENSE',
    status: 'CONFIRMED',
    amountOriginal: '10.00',
    currencyOriginal: 'USD',
    amountBase: '10.00',
    currencyBase: 'USD',
    fxRateUsed: '1',
    merchant: null,
    description: null,
    category: null,
    account: null,
    transactionDate: '2026-07-01T10:00:00.000Z',
    tags: [],
    aiConfidence: null,
    loggedByUserId: 'u1',
    createdAt: '2026-07-01T10:00:00.000Z',
    ...over,
  };
}

describe('TransactionAvatar', () => {
  it('renders one shared swap glyph for every TRANSFER, ignoring category/merchant', async () => {
    await render(<TransactionAvatar tx={mkTx({ type: 'TRANSFER', merchant: 'Chase → Wise' })} />);
    expect(screen.getByText('swap-horizontal', HIDDEN)).toBeTruthy();
  });

  it('delegates to the category visual for an EXPENSE with a known category icon', async () => {
    const tx = mkTx({ type: 'EXPENSE', category: { id: 'c1', name: 'Shopping', icon: 'bag', color: null } });
    await render(<TransactionAvatar tx={tx} />);
    expect(screen.getByText('bag-handle', HIDDEN)).toBeTruthy();
  });

  it('delegates to the derived emoji for an INCOME with no category', async () => {
    await render(<TransactionAvatar tx={mkTx({ type: 'INCOME', merchant: 'Monthly Payroll' })} />);
    expect(screen.getByText('💼', HIDDEN)).toBeTruthy();
  });
});
