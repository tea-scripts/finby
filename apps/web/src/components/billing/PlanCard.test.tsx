import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlanCard } from './PlanCard';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../lib/billing-api', () => ({
  getSubscription: vi.fn(),
  openPortal: vi.fn(),
}));

vi.mock('../../lib/store', () => ({
  useAuth: vi.fn((selector: (s: { workspace: { id: string; tier: string } }) => unknown) =>
    selector({ workspace: { id: 'w1', tier: 'FREE' } }),
  ),
}));

// UpgradeModal does its own store/api calls — stub it out to avoid cascade mocks
vi.mock('./UpgradeModal', () => ({
  UpgradeModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="upgrade-modal">UpgradeModal</div> : null,
}));

import { getSubscription, openPortal } from '../../lib/billing-api';
import { useAuth } from '../../lib/store';

const mockGetSubscription = vi.mocked(getSubscription);
const mockOpenPortal = vi.mocked(openPortal);
const mockUseAuth = vi.mocked(useAuth);

// Stub window.location so redirects don't crash jsdom
Object.defineProperty(window, 'location', {
  value: { href: '' },
  writable: true,
});

beforeEach(() => {
  vi.clearAllMocks();
  window.location.href = '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockUseAuth.mockImplementation((selector: any) =>
    selector({ workspace: { id: 'w1', tier: 'FREE' } }),
  );
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('PlanCard', () => {
  it('free tier: renders "Upgrade to Pro" CTA', async () => {
    mockGetSubscription.mockResolvedValue({
      tier: 'FREE',
      status: 'ACTIVE',
      billingProvider: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    render(<PlanCard />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /upgrade to pro/i })).toBeInTheDocument();
    });
  });

  it('paid tier: renders "Manage Billing" button for Stripe', async () => {
    mockGetSubscription.mockResolvedValue({
      tier: 'PRO',
      status: 'ACTIVE',
      billingProvider: 'STRIPE',
      currentPeriodEnd: '2026-07-01T00:00:00.000Z',
      cancelAtPeriodEnd: false,
    });

    render(<PlanCard />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /manage billing/i })).toBeInTheDocument();
    });
  });

  it('loading: shows skeleton/loading indicator while fetch is pending', () => {
    // Never resolves during this test — stays pending
    mockGetSubscription.mockReturnValue(new Promise(() => {}));

    render(<PlanCard />);

    // Loading container is present with aria-busy or testid
    expect(screen.getByTestId('plan-card-loading')).toBeInTheDocument();
  });

  it('error: shows "Unable to load plan details" on rejection', async () => {
    mockGetSubscription.mockRejectedValue(new Error('network fail'));

    render(<PlanCard />);

    await waitFor(() => {
      expect(screen.getByText('Unable to load plan details')).toBeInTheDocument();
    });
  });

  it('clicking "Manage Billing" calls openPortal with the workspace id', async () => {
    mockGetSubscription.mockResolvedValue({
      tier: 'PRO',
      status: 'ACTIVE',
      billingProvider: 'STRIPE',
      currentPeriodEnd: '2026-07-01T00:00:00.000Z',
      cancelAtPeriodEnd: false,
    });

    mockOpenPortal.mockResolvedValue({ url: 'https://billing.stripe.com/session/x' });

    render(<PlanCard />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /manage billing/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /manage billing/i }));

    await waitFor(() => {
      expect(mockOpenPortal).toHaveBeenCalledWith('w1');
    });

    await waitFor(() => {
      expect(window.location.href).toBe('https://billing.stripe.com/session/x');
    });
  });

  it('free tier: upgrade CTA opens UpgradeModal', async () => {
    mockGetSubscription.mockResolvedValue({
      tier: 'FREE',
      status: 'ACTIVE',
      billingProvider: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    render(<PlanCard />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /upgrade to pro/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /upgrade to pro/i }));

    await waitFor(() => {
      expect(screen.getByTestId('upgrade-modal')).toBeInTheDocument();
    });
  });

  it('paid Paystack: no "Manage Billing" button shown', async () => {
    mockGetSubscription.mockResolvedValue({
      tier: 'PRO',
      status: 'ACTIVE',
      billingProvider: 'PAYSTACK',
      currentPeriodEnd: '2026-07-01T00:00:00.000Z',
      cancelAtPeriodEnd: false,
    });

    render(<PlanCard />);

    await waitFor(() => {
      // Should render billing date (paid tier renders)
      expect(screen.getByText(/next billing date/i)).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /manage billing/i })).not.toBeInTheDocument();
  });

  it('paid tier with cancelAtPeriodEnd: shows cancellation warning', async () => {
    mockGetSubscription.mockResolvedValue({
      tier: 'PRO',
      status: 'ACTIVE',
      billingProvider: 'STRIPE',
      currentPeriodEnd: '2026-07-01T00:00:00.000Z',
      cancelAtPeriodEnd: true,
    });

    render(<PlanCard />);

    await waitFor(() => {
      expect(
        screen.getByText(/your plan cancels at the end of the current period/i),
      ).toBeInTheDocument();
    });
  });
});
