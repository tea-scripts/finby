import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DatePicker } from './date-picker';

describe('DatePicker', () => {
  it('shows the placeholder when unset and a formatted date when set', () => {
    const { rerender } = render(
      <DatePicker value="" onChange={vi.fn()} aria-label="Publish at" placeholder="Pick a date" />,
    );
    expect(screen.getByRole('button', { name: 'Publish at' })).toHaveTextContent('Pick a date');
    rerender(<DatePicker value="2026-07-15" onChange={vi.fn()} aria-label="Publish at" />);
    expect(screen.getByRole('button', { name: 'Publish at' })).toHaveTextContent('Jul 15, 2026');
  });

  it('opens the calendar and emits an ISO date on day select', () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-07-15" onChange={onChange} aria-label="Publish at" />);
    fireEvent.click(screen.getByRole('button', { name: 'Publish at' }));
    fireEvent.click(screen.getByRole('button', { name: 'July 20, 2026' }));
    expect(onChange).toHaveBeenCalledWith('2026-07-20');
  });

  it('clears the value via the clear control when clearable', () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-07-15" onChange={onChange} clearable aria-label="Publish at" />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear date' }));
    expect(onChange).toHaveBeenCalledWith('');
  });
});
