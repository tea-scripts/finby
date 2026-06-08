import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TIER_LIMITS } from '@finby/shared';
import { PlanCard } from './PlanCard';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../lib/billing-api', () => ({
  getSubscription: vi.fn(),
  openPortal: vi.fn(),
  // Mirror the real helper's same-tab fallback so redirect assertions hold.
  openBillingUrl: vi.fn(async (resolveUrl: () => Promise<string>) => {
    window.location.href = await resolveUrl();
  }),
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

// Stable reference — mirrors zustand returning the same workspace object across
// renders. A fresh object per call would make PlanCard's [workspace] effect refire.
const STABLE_FREE_STATE = { workspace: { id: 'w1', tier: 'FREE' } };

beforeEach(() => {
  vi.clearAllMocks();
  window.location.href = '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockUseAuth.mockImplementation((selector: any) => selector(STABLE_FREE_STATE));
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
      pendingTier: null,
      pendingTierEffectiveAt: null,
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
      pendingTier: null,
      pendingTierEffectiveAt: null,
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
      pendingTier: null,
      pendingTierEffectiveAt: null,
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
      pendingTier: null,
      pendingTierEffectiveAt: null,
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
      pendingTier: null,
      pendingTierEffectiveAt: null,
    });

    render(<PlanCard />);

    await waitFor(() => {
      // Should render billing date (paid tier renders)
      expect(screen.getByText(/next billing date/i)).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /manage billing/i })).not.toBeInTheDocument();
  });

  it('compare table derives feature values from TIER_LIMITS (no hardcoded drift)', async () => {
    mockGetSubscription.mockResolvedValue({
      tier: 'FREE',
      status: 'ACTIVE',
      billingProvider: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      pendingTier: null,
      pendingTierEffectiveAt: null,
    });

    render(<PlanCard />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /compare plans/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /compare plans/i }));

    // Cells are computed from TIER_LIMITS — these assertions track the source of truth.
    expect(
      screen.getByText(`${TIER_LIMITS.FREE.transactionHistoryDays} days`),
    ).toBeInTheDocument(); // FREE History
    expect(
      screen.getByText(String(TIER_LIMITS.FREE.chatMessagesPerDay)),
    ).toBeInTheDocument(); // FREE AI messages/day
    expect(screen.getByText(`Up to ${TIER_LIMITS.FAMILY.maxMembers}`)).toBeInTheDocument(); // FAMILY Members
  });

  it('paid tier with cancelAtPeriodEnd: shows cancellation warning', async () => {
    mockGetSubscription.mockResolvedValue({
      tier: 'PRO',
      status: 'ACTIVE',
      billingProvider: 'STRIPE',
      currentPeriodEnd: '2026-07-01T00:00:00.000Z',
      cancelAtPeriodEnd: true,
      pendingTier: null,
      pendingTierEffectiveAt: null,
    });

    render(<PlanCard />);

    await waitFor(() => {
      expect(
        screen.getByText(/your plan cancels at the end of the current period/i),
      ).toBeInTheDocument();
    });
  });
});
