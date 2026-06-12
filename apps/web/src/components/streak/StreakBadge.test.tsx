import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StreakBadge } from './StreakBadge';

describe('StreakBadge', () => {
  it('renders nothing when the streak is zero by default', () => {
    const { container } = render(<StreakBadge streak={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a zero streak when showZero is set (md)', () => {
    render(<StreakBadge streak={0} showZero />);
    expect(screen.getByText(/🔥 0-day streak/)).toBeInTheDocument();
  });

  it('renders a compact zero with showZero at size="sm"', () => {
    render(<StreakBadge streak={0} size="sm" showZero />);
    expect(screen.getByText('🔥 0')).toBeInTheDocument();
  });

  it('does not highlight a zero streak', () => {
    render(<StreakBadge streak={0} showZero />);
    expect(screen.getByText(/0-day streak/)).not.toHaveClass('bg-amber-500/15');
  });

  it('renders an encouraging label for a 1-day streak', () => {
    render(<StreakBadge streak={1} />);
    expect(screen.getByText(/🔥 1-day streak/)).toBeInTheDocument();
  });

  it('renders the day count for a multi-day streak', () => {
    render(<StreakBadge streak={7} />);
    expect(screen.getByText(/🔥 7-day streak/)).toBeInTheDocument();
  });

  it('applies the highlight treatment from 7 days on', () => {
    render(<StreakBadge streak={7} />);
    expect(screen.getByText(/7-day streak/)).toHaveClass('bg-amber-500/15');
  });

  it('does not highlight below 7 days', () => {
    render(<StreakBadge streak={6} />);
    expect(screen.getByText(/6-day streak/)).not.toHaveClass('bg-amber-500/15');
  });

  it('renders the milestone label from 30 days on', () => {
    render(<StreakBadge streak={30} />);
    expect(screen.getByText(/🔥 30-day streak — incredible!/)).toBeInTheDocument();
  });

  it('renders a compact label at size="sm"', () => {
    render(<StreakBadge streak={7} size="sm" />);
    expect(screen.getByText('🔥 7')).toBeInTheDocument();
  });
});
