import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it('renders as a button with an accessible repair label when atRisk + onClick', () => {
    const onClick = vi.fn();
    render(<StreakBadge streak={12} size="sm" atRisk onClick={onClick} />);
    const btn = screen.getByRole('button', { name: /streak at risk/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies the at-risk treatment', () => {
    render(<StreakBadge streak={12} size="sm" atRisk onClick={() => {}} />);
    expect(screen.getByRole('button', { name: /streak at risk/i })).toHaveClass('ring-1');
  });

  it('renders a plain span (no button) when not atRisk', () => {
    render(<StreakBadge streak={12} size="sm" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
