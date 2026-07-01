import { Linking } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

import { PlanCarouselSheet } from './plan-carousel-sheet';

describe('PlanCarouselSheet', () => {
  it('renders all four tiers and marks the current one', async () => {
    await render(<PlanCarouselSheet open onClose={jest.fn()} currentTier="FREE" />);
    expect(screen.getByText('Free')).toBeTruthy();
    expect(screen.getByText('Pro')).toBeTruthy();
    expect(screen.getByText('Premium')).toBeTruthy();
    expect(screen.getByText('Family')).toBeTruthy();
    expect(screen.getAllByText('Current plan').length).toBeGreaterThanOrEqual(1);
  });

  it('a non-current CTA closes the sheet and opens web billing', async () => {
    const onClose = jest.fn();
    const spy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await render(<PlanCarouselSheet open onClose={onClose} currentTier="FREE" />);
    await fireEvent.press(screen.getByText('Upgrade to Pro'));
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(spy).toHaveBeenCalledWith('https://chat.finby.app/settings'));
    spy.mockRestore();
  });

  it('resets to the current-tier card on reopen (Modal unmounts the ScrollView on close)', async () => {
    const { rerender } = await render(
      <PlanCarouselSheet open onClose={jest.fn()} currentTier="FREE" />,
    );
    await fireEvent.press(screen.getByTestId('deck-dot-2'));

    await rerender(<PlanCarouselSheet open={false} onClose={jest.fn()} currentTier="FREE" />);
    await rerender(<PlanCarouselSheet open onClose={jest.fn()} currentTier="FREE" />);

    const dot0 = screen.getByTestId('deck-dot-0').children[0] as unknown as { props: { className: string } };
    const dot2 = screen.getByTestId('deck-dot-2').children[0] as unknown as { props: { className: string } };
    expect(dot0.props.className).toContain('w-5 bg-accent');
    expect(dot2.props.className).toContain('w-1.5 bg-line');
  });

  it('opens focused on the current tier, not always the first card', async () => {
    await render(<PlanCarouselSheet open onClose={jest.fn()} currentTier="PRO" />);
    const dot0 = screen.getByTestId('deck-dot-0').children[0] as unknown as { props: { className: string } };
    const dot1 = screen.getByTestId('deck-dot-1').children[0] as unknown as { props: { className: string } };
    expect(dot1.props.className).toContain('w-5 bg-accent');
    expect(dot0.props.className).toContain('w-1.5 bg-line');
  });
});
