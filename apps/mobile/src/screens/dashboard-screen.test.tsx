// apps/mobile/src/screens/dashboard-screen.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const authState = {
  workspace: { id: 'w1', tier: 'PRO', baseCurrency: 'USD' },
  user: { displayName: 'Tee', currentStreak: 3 },
};
jest.mock('../lib/use-auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector(authState),
}));

jest.mock('../lib/runtime.native', () => ({
  api: {
    dashboard: {
      getSummary: jest.fn(),
      listBudgets: jest.fn(),
      listAccounts: jest.fn(),
      getByCategory: jest.fn(),
      getTrend: jest.fn(),
      getInsight: jest.fn(),
    },
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));
jest.mock('expo-blur', () => ({
  BlurView: ({ children }: { children: unknown }) => children,
}));
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: unknown }) => children,
}));

import { api } from '../lib/runtime.native';
import { DashboardScreen } from './dashboard-screen';

const dash = api.dashboard as unknown as {
  getSummary: jest.Mock;
  listBudgets: jest.Mock;
  listAccounts: jest.Mock;
  getByCategory: jest.Mock;
  getTrend: jest.Mock;
  getInsight: jest.Mock;
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
  dash.getByCategory.mockResolvedValue({ breakdown: [], currency: 'USD' });
  dash.getTrend.mockResolvedValue({ trend: [], currency: 'USD' });
  dash.getInsight.mockResolvedValue({
    period: { from: '2026-06-01', to: '2026-06-25' },
    currency: 'USD',
    direction: 'flat',
    spendDeltaPercent: 0,
    projectionApplies: false,
    projectedSpend: null,
    projectedSavings: null,
    comparedTo: { from: '2026-05-01', to: '2026-05-31' },
    message: 'Not enough history yet.',
  });
});

describe('DashboardScreen', () => {
  it('fetches the month-scoped analytics on mount', async () => {
    await render(<DashboardScreen />);
    await waitFor(() => expect(dash.getByCategory).toHaveBeenCalled());
    expect(dash.getInsight).toHaveBeenCalled();
    expect(dash.getTrend).toHaveBeenCalled();
    expect(dash.listBudgets).toHaveBeenCalledWith('w1', expect.stringMatching(/^\d{4}-\d{2}-01$/));
    expect(screen.queryByText('Recent transactions')).toBeNull(); // removed
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
    expect(dash.getByCategory).toHaveBeenCalledTimes(1);
    expect(dash.getTrend).toHaveBeenCalledTimes(1);
    expect(dash.getInsight).toHaveBeenCalledTimes(1);
  });

  it('retrying one section reloads only that endpoint', async () => {
    dash.getByCategory.mockRejectedValueOnce(new Error('x'));
    await render(<DashboardScreen />);
    // donut is the only section in error → single Retry
    await fireEvent.press(await screen.findByText('Retry'));
    await waitFor(() => expect(dash.getByCategory).toHaveBeenCalledTimes(2)); // initial + retry
    expect(dash.getSummary).toHaveBeenCalledTimes(1); // NOT re-fetched
    expect(dash.getInsight).toHaveBeenCalledTimes(1);
    expect(dash.listBudgets).toHaveBeenCalledTimes(1);
  });
});
