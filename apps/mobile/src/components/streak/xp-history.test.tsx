// apps/mobile/src/components/streak/xp-history.test.tsx
import { render, screen } from '@testing-library/react-native';
import type { XpTransactionView } from '@finby/shared';
import { XpHistory } from './xp-history';

const tx = (over: Partial<XpTransactionView>): XpTransactionView =>
  ({ id: 'x', event: 'TRANSACTION_LOGGED', delta: 5, meta: null, createdAt: new Date().toISOString(), ...over });

describe('XpHistory', () => {
  it('renders rows with labels and signed deltas', async () => {
    await render(<XpHistory history={[tx({ id: '1', delta: 5 }), tx({ id: '2', event: 'STREAK_RECOVERY', delta: -10 })]} />);
    expect(screen.getByText('Transaction logged')).toBeTruthy();
    expect(screen.getByText('+5 XP')).toBeTruthy();
    expect(screen.getByText('-10 XP')).toBeTruthy();
  });

  it('shows an empty state when there is no history', async () => {
    await render(<XpHistory history={[]} />);
    expect(screen.getByText(/No XP earned yet/)).toBeTruthy();
  });
});
