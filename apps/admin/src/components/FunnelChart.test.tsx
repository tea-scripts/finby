import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { FunnelMetrics } from '@finby/shared';
import { FunnelChart } from './FunnelChart';

function metrics(overrides: Partial<FunnelMetrics> = {}): FunnelMetrics {
  return {
    key: 'activation',
    label: 'Activation',
    windowDays: 30,
    configured: true,
    steps: [
      { event: 'signed_up', label: 'Signed up', count: 100, conversionFromStart: 100, conversionFromPrev: 100 },
      { event: 'onboarding_completed', label: 'Completed onboarding', count: 60, conversionFromStart: 60, conversionFromPrev: 60 },
      { event: 'transaction_logged', label: 'Logged a transaction', count: 30, conversionFromStart: 30, conversionFromPrev: 50 },
    ],
    ...overrides,
  };
}

describe('FunnelChart', () => {
  it('renders each step with its label, count and conversion %', () => {
    render(<FunnelChart data={metrics()} />);
    expect(screen.getByText('Signed up')).toBeInTheDocument();
    expect(screen.getByText('Completed onboarding')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('60')).toBeInTheDocument();
    // from-prev conversion for the last step (50%)
    expect(screen.getByText(/50%/)).toBeInTheDocument();
  });

  it('shows a setup hint when PostHog is not configured', () => {
    render(<FunnelChart data={metrics({ configured: false, steps: [] })} />);
    expect(screen.getByText(/not configured/i)).toBeInTheDocument();
    expect(screen.queryByText('Signed up')).not.toBeInTheDocument();
  });
});
