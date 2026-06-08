import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReferSection } from './refer-section';

describe('ReferSection', () => {
  it('renders the Refer & Earn teaser with a Coming soon badge', () => {
    render(<ReferSection />);
    expect(screen.getByRole('heading', { name: /refer & earn/i })).toBeInTheDocument();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    expect(screen.getByText(/invite friends/i)).toBeInTheDocument();
  });
});
