import { render, screen } from '@testing-library/react-native';
import type { CategoryBreakdownResult } from '@finby/shared';
import { SpendingDonut } from './spending-donut';

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
    G: stub('G'),
    Path: stub('Path'),
    Defs: stub('Defs'),
    LinearGradient: stub('LinearGradient'),
    Stop: stub('Stop'),
  };
});

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));

const data: CategoryBreakdownResult = {
  currency: 'USD',
  breakdown: [
    { category: { id: 'c1', name: 'Food & Dining', icon: 'utensils', color: '#E2683C' }, total: '965', percent: 49, transactionCount: 12 },
    { category: { id: 'c2', name: 'Shopping', icon: 'bag', color: '#EC4899' }, total: '508', percent: 26, transactionCount: 6 },
  ],
};

describe('SpendingDonut', () => {
  it('renders the spent total and a legend row per category', async () => {
    await render(<SpendingDonut state={{ data, loading: false, error: null }} onRetry={() => {}} />);
    expect(screen.getByText(/1,473/, { includeHiddenElements: true })).toBeTruthy(); // 965 + 508
    expect(screen.getByText('Food & Dining')).toBeTruthy();
    expect(screen.getByText('Shopping')).toBeTruthy();
  });

  it('shows an empty state when there is no spending', async () => {
    await render(<SpendingDonut state={{ data: { currency: 'USD', breakdown: [] }, loading: false, error: null }} onRetry={() => {}} />);
    expect(screen.getByText(/no spending/i)).toBeTruthy();
  });
});
