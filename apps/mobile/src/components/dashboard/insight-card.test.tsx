import { render, screen } from '@testing-library/react-native';
import type { InsightResult } from '@finby/shared';
import { InsightCard } from './insight-card';

function base(over: Partial<InsightResult>): InsightResult {
  return {
    period: { from: '2026-07-01', to: '2026-07-15' },
    currency: 'USD',
    direction: 'less',
    spendDeltaPercent: 12,
    projectionApplies: true,
    projectedSpend: '2000.00',
    projectedSavings: '1940.00',
    comparedTo: { from: '2026-06-01', to: '2026-06-30' },
    message: 'You\'re on pace to spend 12% less than last month.',
    ...over,
  };
}

describe('InsightCard', () => {
  it('shows the delta and the projected savings for the current month', async () => {
    await render(<InsightCard state={{ data: base({}), loading: false, error: null }} onRetry={() => {}} />);
    expect(screen.getByText(/12% less/)).toBeTruthy();
    expect(screen.getByText(/1,940/)).toBeTruthy();
  });

  it('omits the savings projection for a past month', async () => {
    const past = base({ projectionApplies: false, projectedSavings: null, projectedSpend: null });
    await render(<InsightCard state={{ data: past, loading: false, error: null }} onRetry={() => {}} />);
    expect(screen.getByText(/12% less/)).toBeTruthy();
    expect(screen.queryByText(/save/i)).toBeNull();
  });

  it('renders the flat/no-history message plainly', async () => {
    const flat = base({ direction: 'flat', spendDeltaPercent: 0, message: 'Not enough history yet to compare to last month.' });
    await render(<InsightCard state={{ data: flat, loading: false, error: null }} onRetry={() => {}} />);
    expect(screen.getByText(/not enough history/i)).toBeTruthy();
  });
});
