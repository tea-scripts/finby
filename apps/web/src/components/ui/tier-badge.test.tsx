import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TierBadge } from './tier-badge';

describe('TierBadge', () => {
  it('renders "Free" for FREE tier', () => {
    render(<TierBadge tier="FREE" />);
    expect(screen.getByText('Free')).toBeInTheDocument();
  });

  it('renders "Pro" for PRO tier', () => {
    render(<TierBadge tier="PRO" />);
    expect(screen.getByText('Pro')).toBeInTheDocument();
  });

  it('renders "Premium" for PREMIUM tier', () => {
    render(<TierBadge tier="PREMIUM" />);
    expect(screen.getByText('Premium')).toBeInTheDocument();
  });

  it('renders "Family" for FAMILY tier', () => {
    render(<TierBadge tier="FAMILY" />);
    expect(screen.getByText('Family')).toBeInTheDocument();
  });
});
