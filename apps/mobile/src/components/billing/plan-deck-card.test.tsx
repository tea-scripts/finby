import { render, screen, fireEvent } from '@testing-library/react-native';

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

  it('the current tier shows a disabled "Current plan" marker (pill + CTA) and a note', async () => {
    const onSelect = jest.fn();
    await render(<PlanDeckCard tier="PRO" currentTier="PRO" focused onSelect={onSelect} />);
    // "Current plan" appears twice: the header pill and the disabled CTA label.
    expect(screen.getByTestId('current-pill')).toBeTruthy();
    expect(screen.getAllByText('Current plan')).toHaveLength(2);
    expect(screen.getByText("You're on this plan")).toBeTruthy();
    await fireEvent.press(screen.getByTestId('deck-cta'));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
