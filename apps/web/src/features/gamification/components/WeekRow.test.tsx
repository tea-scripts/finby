import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WeekRow } from './WeekRow';

// 2026-06-15 is a Monday, so its ISO week runs 06-15 (Mon) .. 06-21 (Sun).

describe('WeekRow', () => {
  it('renders 7 day columns for the current ISO week', () => {
    render(<WeekRow activeDays={[]} repairedDays={[]} today="2026-06-15" />);
    expect(screen.getAllByRole('listitem')).toHaveLength(7);
  });

  it('marks active days as logged', () => {
    render(<WeekRow activeDays={['2026-06-15']} repairedDays={[]} today="2026-06-17" />);
    expect(screen.getByLabelText('2026-06-15 logged')).toBeInTheDocument();
  });

  it('also marks repaired days as logged', () => {
    render(<WeekRow activeDays={[]} repairedDays={['2026-06-16']} today="2026-06-17" />);
    expect(screen.getByLabelText('2026-06-16 logged')).toBeInTheDocument();
  });

  it('renders future days with their day-of-month number', () => {
    render(<WeekRow activeDays={[]} repairedDays={[]} today="2026-06-15" />);
    // Monday is "today"; 06-16..06-21 are future and show their numbers.
    expect(screen.getByText('16')).toBeInTheDocument();
    expect(screen.getByText('21')).toBeInTheDocument();
  });

  it('treats the provided today distinctly (no day-number, not logged)', () => {
    render(<WeekRow activeDays={[]} repairedDays={[]} today="2026-06-15" />);
    // Today (06-15) is neither logged nor future, so its number "15" is not shown.
    expect(screen.queryByText('15')).not.toBeInTheDocument();
    expect(screen.getByLabelText('2026-06-15')).toBeInTheDocument();
  });
});
