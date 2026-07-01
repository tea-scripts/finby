import { render, screen, fireEvent } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));

import { PlanDeckCard } from './plan-deck-card';

describe('PlanDeckCard', () => {
  it('a higher tier shows price + an Upgrade CTA that fires onSelect', async () => {
    const onSelect = jest.fn();
    await render(<PlanDeckCard tier="PREMIUM" currentTier="PRO" focused onSelect={onSelect} />);
    expect(screen.getByText('Premium')).toBeTruthy();
    expect(screen.getByText('$9.99/mo')).toBeTruthy();
    await fireEvent.press(screen.getByText('Upgrade to Premium'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('a lower tier shows a Switch CTA (never "Upgrade to Free")', async () => {
    await render(<PlanDeckCard tier="FREE" currentTier="PRO" focused={false} onSelect={jest.fn()} />);
    expect(screen.getByText('Switch to Free')).toBeTruthy();
    expect(screen.queryByText('Upgrade to Free')).toBeNull();
  });

  it('the current tier shows a disabled "Current plan" marker', async () => {
    const onSelect = jest.fn();
    await render(<PlanDeckCard tier="PRO" currentTier="PRO" focused onSelect={onSelect} />);
    expect(screen.getByText('Current plan')).toBeTruthy();
    await fireEvent.press(screen.getByText('Current plan'));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
