import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('./bottom-sheet', () => ({
  BottomSheet: ({ open, children }: { open: boolean; children: unknown }) => (open ? children : null),
}));

import { DatePicker } from './date-picker';

describe('DatePicker', () => {
  it('shows the placeholder when empty', async () => {
    await render(<DatePicker value="" onChange={jest.fn()} placeholder="Pick a date" />);
    expect(screen.getByText('Pick a date')).toBeTruthy();
  });

  it('opens the calendar and selects a day', async () => {
    const onChange = jest.fn();
    await render(<DatePicker value="2026-06-10" onChange={onChange} />);
    fireEvent.press(screen.getByTestId('date-trigger'));
    // Calendar opens on June 2026; pick the 15th.
    await waitFor(() => screen.getByTestId('day-15'));
    fireEvent.press(screen.getByTestId('day-15'));
    expect(onChange).toHaveBeenCalledWith('2026-06-15');
  });
});
