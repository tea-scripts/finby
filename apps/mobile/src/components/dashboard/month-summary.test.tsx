import { render, screen } from '@testing-library/react-native';
import type { SummaryResult } from '@finby/shared';
import { MonthSummary } from './month-summary';

const data: SummaryResult = {
  period: { from: '2026-06-01', to: '2026-06-25' },
  totalIncome: '5000.00',
  totalExpenses: '1200.50',
  netSavings: '3799.50',
  savingsRate: 76,
  currency: 'USD',
  transactionCount: 12,
};

describe('MonthSummary', () => {
  it('renders the income/expenses/net/savings-rate stats', async () => {
    await render(<MonthSummary state={{ data, loading: false, error: null }} onRetry={jest.fn()} />);
    expect(screen.getByText('Income')).toBeTruthy();
    expect(screen.getByText('$5,000.00')).toBeTruthy();
    expect(screen.getByText('Expenses')).toBeTruthy();
    expect(screen.getByText('$1,200.50')).toBeTruthy();
    expect(screen.getByText('Net savings')).toBeTruthy();
    expect(screen.getByText('$3,799.50')).toBeTruthy();
    expect(screen.getByText('Savings rate')).toBeTruthy();
    expect(screen.getByText('76%')).toBeTruthy();
  });

  it('shows a skeleton, not the spinner, while loading', async () => {
    await render(<MonthSummary state={{ data: null, loading: true, error: null }} onRetry={() => {}} />);
    expect(screen.getAllByTestId('skeleton', { includeHiddenElements: true }).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('section-loading')).toBeNull();
  });

  it('renders error with retry', async () => {
    await render(<MonthSummary state={{ data: null, loading: false, error: 'boom' }} onRetry={jest.fn()} />);
    expect(screen.getByTestId('section-retry')).toBeTruthy();
  });
});
