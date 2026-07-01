import { render, screen, fireEvent } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));

import type { SubscriptionView } from '@finby/shared';
import { CurrentPlanCard } from './current-plan-card';

const sub = (over: Partial<SubscriptionView> = {}): SubscriptionView => ({
  tier: 'FREE', status: 'ACTIVE', billingProvider: null, currentPeriodEnd: null,
  cancelAtPeriodEnd: false, pendingTier: null, pendingTierEffectiveAt: null, ...over,
});

describe('CurrentPlanCard', () => {
  it('FREE: shows limit rows, an Upgrade button, and reveals the compare table on toggle', async () => {
    const onChangePlan = jest.fn();
    await render(
      <CurrentPlanCard sub={sub()} onChangePlan={onChangePlan} onManage={jest.fn()} managing={false} />,
    );
    expect(screen.getByText('Free')).toBeTruthy();
    expect(screen.getByText('AI messages')).toBeTruthy(); // a free-limit row label
    expect(screen.queryByText('Manage billing')).toBeNull();
    await fireEvent.press(screen.getByText('Upgrade to Pro'));
    expect(onChangePlan).toHaveBeenCalledTimes(1);
    // Compare toggle
    expect(screen.queryByText('AI messages/day')).toBeNull(); // compare-table row hidden initially
    await fireEvent.press(screen.getByText('Compare plans'));
    expect(screen.getByText('AI messages/day')).toBeTruthy();
  });

  it('paid + Stripe: shows billing date, Change plan and Manage billing', async () => {
    const onManage = jest.fn();
    await render(
      <CurrentPlanCard
        sub={sub({ tier: 'PRO', billingProvider: 'STRIPE', currentPeriodEnd: '2026-08-01T00:00:00Z' })}
        onChangePlan={jest.fn()}
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
