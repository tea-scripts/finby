import { render, screen } from '@testing-library/react-native';
import type { BudgetView } from '@finby/shared';
import { BudgetList } from './budget-list';

const budget: BudgetView = {
  id: 'b1',
  category: { id: 'c1', name: 'Groceries' },
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
  });

  it('renders empty state', async () => {
    await render(<BudgetList state={{ data: [], loading: false, error: null }} onRetry={jest.fn()} />);
    expect(screen.getByText('No budgets yet.')).toBeTruthy();
  });

  it('renders error with retry', async () => {
    await render(<BudgetList state={{ data: null, loading: false, error: 'x' }} onRetry={jest.fn()} />);
    expect(screen.getByTestId('section-retry')).toBeTruthy();
  });
});
