import { render, screen, fireEvent } from '@testing-library/react-native';
import { MonthSelector } from './month-selector';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));
// Stub the plan sheet so we can assert it opens without rendering its internals.
jest.mock('../billing/plan-carousel-sheet', () => ({
  PlanCarouselSheet: ({ open }: { open: boolean }) =>
    open ? jest.requireActual<typeof import('react')>('react').createElement('Text', null, 'PLANS_OPEN') : null,
}));

describe('MonthSelector', () => {
  const cur = { year: 2026, month: 6 }; // July 2026 (assume tests run relative to a real "now" >= this is not required; use PRO to avoid now-coupling)

  it('steps back a month on the previous chevron (PRO, unlimited)', async () => {
    const onChange = jest.fn();
    await render(<MonthSelector month={cur} onChange={onChange} tier="PRO" />);
    await fireEvent.press(screen.getByLabelText('Previous month'));
    expect(onChange).toHaveBeenCalledWith({ year: 2026, month: 5 });
  });

  it('opens the upgrade sheet instead of navigating when a FREE user hits the history floor', async () => {
    // A far-past month guarantees FREE is at/over the floor regardless of "now".
    const onChange = jest.fn();
    await render(<MonthSelector month={{ year: 2000, month: 0 }} onChange={onChange} tier="FREE" />);
    await fireEvent.press(screen.getByLabelText('Previous month'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('PLANS_OPEN')).toBeTruthy();
  });
});
