import { render, screen } from '@testing-library/react-native';
import type { BudgetView } from '@finby/shared';
import { BudgetList } from './budget-list';

// Mock Ionicons to render its `name` as text so we can assert which glyph shows
// (same pattern as category-avatar.test.tsx / tab-bar-icon.test.tsx).
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));

const budget: BudgetView = {
  id: 'b1',
  category: { id: 'c1', name: 'Groceries', icon: 'cart', color: '#1A7A4A' },
  amountLimit: '500.00',
  amountSpent: '300.00',
  currency: 'USD',
  utilizationPercent: 60,
  period: 'MONTHLY',
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30',
  isActive: true,
};

describe('BudgetList', () => {
  it('renders a budget row with spent/limit', async () => {
    await render(<BudgetList state={{ data: [budget], loading: false, error: null }} onRetry={jest.fn()} />);
    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.getByText('$300.00 / $500.00')).toBeTruthy();
    // CategoryAvatar is decorative (a11y-hidden) — assert the resolved Ionicons glyph via the mock above.
    expect(screen.getByText('cart', { includeHiddenElements: true })).toBeTruthy();
  });

  it('renders empty state', async () => {
    await render(<BudgetList state={{ data: [], loading: false, error: null }} onRetry={jest.fn()} />);
    expect(screen.getByText('No budgets for this month.')).toBeTruthy();
  });

  it('renders error with retry', async () => {
    await render(<BudgetList state={{ data: null, loading: false, error: 'x' }} onRetry={jest.fn()} />);
    expect(screen.getByTestId('section-retry')).toBeTruthy();
  });
});
