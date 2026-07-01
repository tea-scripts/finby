import { render, screen, fireEvent } from '@testing-library/react-native';
import type { TrendResult } from '@finby/shared';
import { SpendTrend } from './spend-trend';

jest.mock('react-native-svg', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const stub =
    (n: string) =>
    (p: { children?: React.ReactNode }) =>
      React.createElement(n, null, p.children);
  return {
    __esModule: true,
    default: stub('Svg'),
    Svg: stub('Svg'),
    Circle: stub('Circle'),
    Defs: stub('Defs'),
    Line: stub('Line'),
    LinearGradient: stub('LinearGradient'),
    Path: stub('Path'),
    Stop: stub('Stop'),
  };
});

const data: TrendResult = {
  currency: 'USD',
  trend: [
    { month: '2026-05', income: '4000', expenses: '2200', savings: '1800' },
    { month: '2026-06', income: '4200', expenses: '2540', savings: '1660' },
  ],
};

describe('SpendTrend', () => {
  it('renders a month label for each point', async () => {
    await render(<SpendTrend state={{ data, loading: false, error: null }} onRetry={() => {}} />);
    expect(screen.getByText('May')).toBeTruthy();
    expect(screen.getByText('Jun')).toBeTruthy();
  });

  it('shows the latest month spend as a readout so the line is self-explanatory', async () => {
    await render(<SpendTrend state={{ data, loading: false, error: null }} onRetry={() => {}} />);
    expect(screen.getByText(/2,540/)).toBeTruthy(); // latest month expenses
    expect(screen.getByText(/spent in Jun/i)).toBeTruthy();
  });

  it('tapping a month selects it and updates the readout; tapping again resets to latest', async () => {
    await render(<SpendTrend state={{ data, loading: false, error: null }} onRetry={() => {}} />);
    // default = latest month (Jun, 2540)
    expect(screen.getByText(/2,540/)).toBeTruthy();
    // tap the May column → readout shows May's spend
    await fireEvent.press(screen.getByLabelText(/May 2026/));
    expect(screen.getByText(/2,200/)).toBeTruthy();
    expect(screen.getByText(/spent in May/i)).toBeTruthy();
    // tap May again → back to the latest month
    await fireEvent.press(screen.getByLabelText(/May 2026/));
    expect(screen.getByText(/2,540/)).toBeTruthy();
    expect(screen.getByText(/spent in Jun/i)).toBeTruthy();
  });

  it('shows an empty state with no data', async () => {
    await render(<SpendTrend state={{ data: { currency: 'USD', trend: [] }, loading: false, error: null }} onRetry={() => {}} />);
    expect(screen.getByText(/not enough/i)).toBeTruthy();
  });
});
