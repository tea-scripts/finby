// apps/mobile/src/screens/dashboard-screen.test.tsx
import { render, screen, waitFor } from '@testing-library/react-native';

const authState = { workspace: { id: 'w1' }, user: { displayName: 'Tee', currentStreak: 3 } };
jest.mock('../lib/use-auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector(authState),
}));

jest.mock('../lib/runtime.native', () => ({
  api: {
    dashboard: {
      getSummary: jest.fn(),
      listBudgets: jest.fn(),
      listAccounts: jest.fn(),
      listRecentTransactions: jest.fn(),
    },
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => require('react').createElement('Text', null, name),
}));

import { api } from '../lib/runtime.native';
import { DashboardScreen } from './dashboard-screen';

const dash = api.dashboard as unknown as {
  getSummary: jest.Mock;
  listBudgets: jest.Mock;
  listAccounts: jest.Mock;
  listRecentTransactions: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  dash.getSummary.mockResolvedValue({
    period: { from: '2026-06-01', to: '2026-06-25' },
    totalIncome: '5000.00', totalExpenses: '1200.00', netSavings: '3800.00',
    savingsRate: 76, currency: 'USD', transactionCount: 12,
  });
  dash.listBudgets.mockResolvedValue([]);
  dash.listAccounts.mockResolvedValue([]);
  dash.listRecentTransactions.mockResolvedValue([]);
});

describe('DashboardScreen', () => {
  it('renders the header with the streak count', async () => {
    await render(<DashboardScreen />);
    expect(screen.getByText('Dashboard')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('3')).toBeTruthy());
  });

  it('paints summary data and isolates a failing section', async () => {
    dash.listBudgets.mockRejectedValue(new Error('boom'));
    await render(<DashboardScreen />);
    // Summary still paints…
    await waitFor(() => expect(screen.getByText('$5,000.00')).toBeTruthy());
    // …and the failed budgets section shows its retry without blanking others.
    await waitFor(() => expect(screen.getByTestId('section-retry')).toBeTruthy());
  });

  it('fetches each section once on mount', async () => {
    await render(<DashboardScreen />);
    await waitFor(() => expect(dash.getSummary).toHaveBeenCalledTimes(1));
    expect(dash.listBudgets).toHaveBeenCalledTimes(1);
    expect(dash.listAccounts).toHaveBeenCalledTimes(1);
    expect(dash.listRecentTransactions).toHaveBeenCalledWith('w1', 10);
  });
});
