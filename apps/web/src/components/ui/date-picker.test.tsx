import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DatePicker } from './date-picker';

describe('DatePicker', () => {
  it('shows the placeholder when no value is set', () => {
    render(<DatePicker value="" onChange={() => {}} placeholder="Pick a date" aria-label="Date" />);
    expect(screen.getByRole('button', { name: 'Date' })).toHaveTextContent('Pick a date');
  });

  it('shows the formatted date when a value is set', () => {
    render(<DatePicker value="2026-06-13" onChange={() => {}} aria-label="Date" />);
    expect(screen.getByRole('button', { name: 'Date' })).toHaveTextContent('Jun 13, 2026');
  });

  it('opens the calendar to the value month and selects a day, emitting an ISO date', () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-06-13" onChange={onChange} aria-label="Date" />);

    fireEvent.click(screen.getByRole('button', { name: 'Date' }));
    expect(screen.getByText('June 2026')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'June 20, 2026' }));
    expect(onChange).toHaveBeenCalledWith('2026-06-20');
  });

  it('navigates to previous and next months', () => {
    render(<DatePicker value="2026-06-13" onChange={() => {}} aria-label="Date" />);
    fireEvent.click(screen.getByRole('button', { name: 'Date' }));

    fireEvent.click(screen.getByRole('button', { name: /previous month/i }));
    expect(screen.getByText('May 2026')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /next month/i }));
    fireEvent.click(screen.getByRole('button', { name: /next month/i }));
    expect(screen.getByText('July 2026')).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    render(<DatePicker value="2026-06-13" onChange={() => {}} aria-label="Date" />);
    const trigger = screen.getByRole('button', { name: 'Date' });

    fireEvent.click(trigger);
    expect(screen.getByText('June 2026')).toBeInTheDocument();

    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByText('June 2026')).not.toBeInTheDocument();
  });

  it('clears the value via the clear control when clearable', () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-06-13" onChange={onChange} aria-label="Date" clearable />);
    fireEvent.click(screen.getByRole('button', { name: /clear date/i }));
    expect(onChange).toHaveBeenCalledWith('');
  });
});
