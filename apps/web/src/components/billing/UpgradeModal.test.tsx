import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UpgradeModal } from './UpgradeModal';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../lib/billing-api', () => ({
  getPlans: vi.fn(),
  startCheckout: vi.fn(),
}));

vi.mock('../../lib/store', () => ({
  useAuth: vi.fn((selector: (s: { workspace: { id: string } }) => unknown) =>
    selector({ workspace: { id: 'w1' } }),
  ),
}));

import { getPlans, startCheckout } from '../../lib/billing-api';
import { useAuth } from '../../lib/store';

const mockUseAuth = vi.mocked(useAuth);

const mockGetPlans = vi.mocked(getPlans);
const mockStartCheckout = vi.mocked(startCheckout);

const PLANS = [
  {
    tier: 'PRO' as const,
    name: 'Pro',
    priceDisplay: '$9/mo',
    amountMinor: 900,
    currency: 'USD',
    interval: 'month',
    highlights: ['Unlimited budgets', 'AI insights'],
  },
  {
    tier: 'PREMIUM' as const,
    name: 'Premium',
    priceDisplay: '$19/mo',
    amountMinor: 1900,
    currency: 'USD',
    interval: 'month',
    highlights: ['Everything in Pro', 'Advanced reports'],
  },
  {
    tier: 'FAMILY' as const,
    name: 'Family',
    priceDisplay: '$29/mo',
    amountMinor: 2900,
    currency: 'USD',
    interval: 'month',
    highlights: ['Up to 6 members', 'Shared budgets'],
  },
];

// Stub window.location so redirect assertions don't crash jsdom
Object.defineProperty(window, 'location', {
  value: { href: '' },
  writable: true,
});

beforeEach(() => {
  vi.clearAllMocks();
  window.location.href = '';
  // Restore default workspace selector so per-test overrides don't bleed across tests
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockUseAuth.mockImplementation((selector: any) => selector({ workspace: { id: 'w1' } }));
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('UpgradeModal', () => {
  it('renders all three plan tabs when open with plans loaded', async () => {
    mockGetPlans.mockResolvedValue({ plans: PLANS });

    render(<UpgradeModal open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Pro')).toBeInTheDocument();
      expect(screen.getByText('Premium')).toBeInTheDocument();
      expect(screen.getByText('Family')).toBeInTheDocument();
    });
  });

  it('switching tabs shows that plan price and highlights', async () => {
    mockGetPlans.mockResolvedValue({ plans: PLANS });

    render(<UpgradeModal open={true} onClose={vi.fn()} />);

    // Wait for plans to load (default is Pro)
    await waitFor(() => expect(screen.getByText('$9/mo')).toBeInTheDocument());

    // Switch to Premium
    fireEvent.click(screen.getByRole('button', { name: 'Premium' }));

    expect(screen.getByText('$19/mo')).toBeInTheDocument();
    expect(screen.getByText('Everything in Pro')).toBeInTheDocument();
    expect(screen.getByText('Advanced reports')).toBeInTheDocument();

    // Pro content should no longer be visible
    expect(screen.queryByText('$9/mo')).not.toBeInTheDocument();
  });

  it('calls startCheckout with workspaceId and selected tier, then sets redirect url', async () => {
    mockGetPlans.mockResolvedValue({ plans: PLANS });
    mockStartCheckout.mockResolvedValue({ url: 'https://checkout.stripe/x' });

    render(<UpgradeModal open={true} onClose={vi.fn()} initialTier="PRO" />);

    await waitFor(() => expect(screen.getByText('$9/mo')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /start upgrade/i }));

    await waitFor(() => {
      expect(mockStartCheckout).toHaveBeenCalledWith('w1', 'PRO');
    });

    await waitFor(() => expect(window.location.href).toBe('https://checkout.stripe/x'));
  });

  it('shows loading state while plans fetch is pending, then shows content', async () => {
    let resolve!: (v: { plans: typeof PLANS }) => void;
    mockGetPlans.mockReturnValue(
      new Promise<{ plans: typeof PLANS }>((res) => { resolve = res; }),
    );

    render(<UpgradeModal open={true} onClose={vi.fn()} />);

    // Should show loading while pending
    expect(screen.getByText(/loading plans/i)).toBeInTheDocument();

    // Resolve the fetch
    resolve({ plans: PLANS });

    await waitFor(() => {
      expect(screen.queryByText(/loading plans/i)).not.toBeInTheDocument();
      expect(screen.getByText('$9/mo')).toBeInTheDocument();
    });
  });

  it('shows error state if getPlans rejects', async () => {
    mockGetPlans.mockRejectedValue(new Error('network fail'));

    render(<UpgradeModal open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Couldn't load plans")).toBeInTheDocument();
    });
  });

  it('does not call startCheckout and shows error when workspaceId is undefined', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseAuth.mockImplementation((selector: any) => selector({ workspace: undefined }));

    mockGetPlans.mockResolvedValue({ plans: PLANS });

    render(<UpgradeModal open={true} onClose={vi.fn()} initialTier="PRO" />);

    await waitFor(() => expect(screen.getByText('$9/mo')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /start upgrade/i }));

    await waitFor(() => {
      expect(screen.getByText('No workspace found. Please reload and try again.')).toBeInTheDocument();
    });

    expect(mockStartCheckout).not.toHaveBeenCalled();
  });

  it('shows button loading while startCheckout is pending and submit error on reject', async () => {
    mockGetPlans.mockResolvedValue({ plans: PLANS });

    let rejectCheckout!: (e: Error) => void;
    mockStartCheckout.mockReturnValue(
      new Promise<{ url: string }>((_res, rej) => { rejectCheckout = rej; }),
    );

    render(<UpgradeModal open={true} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('$9/mo')).toBeInTheDocument());

    const btn = screen.getByRole('button', { name: /start upgrade/i });
    fireEvent.click(btn);

    // Button should be disabled while submitting
    await waitFor(() => expect(btn).toBeDisabled());

    // Reject the checkout
    rejectCheckout(new Error('stripe fail'));

    await waitFor(() => {
      expect(screen.getByText("Couldn't start checkout. Please try again.")).toBeInTheDocument();
    });

    // Button should be enabled again after failure
    expect(btn).not.toBeDisabled();
  });
});
