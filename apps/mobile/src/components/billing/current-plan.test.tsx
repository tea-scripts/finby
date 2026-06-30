import { render, screen, fireEvent } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));

import type { SubscriptionView } from '@finby/shared';
import { CurrentPlan } from './current-plan';

const sub = (over: Partial<SubscriptionView> = {}): SubscriptionView => ({
  tier: 'FREE', status: 'ACTIVE', billingProvider: null, currentPeriodEnd: null,
  cancelAtPeriodEnd: false, pendingTier: null, pendingTierEffectiveAt: null, ...over,
});

describe('CurrentPlan', () => {
  it('FREE: shows an Upgrade button, no Manage', async () => {
    const onUpgrade = jest.fn();
    await render(<CurrentPlan sub={sub()} onUpgrade={onUpgrade} onManage={jest.fn()} managing={false} />);
    expect(screen.getByText('Free')).toBeTruthy();
    await fireEvent.press(screen.getByText('Upgrade'));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Manage billing')).toBeNull();
  });

  it('paid + Stripe: shows billing date, Change plan and Manage billing', async () => {
    const onManage = jest.fn();
    await render(
      <CurrentPlan
        sub={sub({ tier: 'PRO', billingProvider: 'STRIPE', currentPeriodEnd: '2026-08-01T00:00:00Z' })}
        onUpgrade={jest.fn()}
        onManage={onManage}
        managing={false}
      />,
    );
    expect(screen.getByText('Pro')).toBeTruthy();
    expect(screen.getByText(/Next billing/)).toBeTruthy();
    expect(screen.getByText('Change plan')).toBeTruthy();
    await fireEvent.press(screen.getByText('Manage billing'));
    expect(onManage).toHaveBeenCalledTimes(1);
  });
});
