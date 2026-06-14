import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UpgradeModal } from './UpgradeModal';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../lib/analytics', () => ({ track: vi.fn() }));

vi.mock('../../lib/billing-api', () => ({
  getPlans: vi.fn(),
  startCheckout: vi.fn(),
  changePlan: vi.fn(),
  // Mirror the real helper's same-tab fallback so redirect assertions hold.
  openBillingUrl: vi.fn(async (resolveUrl: () => Promise<string>) => {
    window.location.href = await resolveUrl();
  }),
}));

vi.mock('../../lib/store', () => ({
  useAuth: vi.fn((selector: (s: { workspace: { id: string } }) => unknown) =>
    selector({ workspace: { id: 'w1' } }),
  ),
}));

import { getPlans, startCheckout, changePlan } from '../../lib/billing-api';
import { useAuth } from '../../lib/store';

const mockUseAuth = vi.mocked(useAuth);
const mockGetPlans = vi.mocked(getPlans);
const mockStartCheckout = vi.mocked(startCheckout);
const mockChangePlan = vi.mocked(changePlan);

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

// jsdom doesn't implement scrollIntoView — the carousel calls it to center cards.
Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), writable: true });

// Stub window.location so redirect assertions don't crash jsdom
Object.defineProperty(window, 'location', {
  value: { href: '' },
  writable: true,
});

beforeEach(() => {
  vi.clearAllMocks();
  window.location.href = '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockUseAuth.mockImplementation((selector: any) => selector({ workspace: { id: 'w1' } }));
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('UpgradeModal carousel', () => {
  it('renders every plan card (name, price, highlights all visible at once)', async () => {
    mockGetPlans.mockResolvedValue({ plans: PLANS });

    render(<UpgradeModal open onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole('group', { name: 'Plans' })).toBeInTheDocument());

    // Card headings
    expect(screen.getByRole('heading', { name: 'Pro' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Premium' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Family' })).toBeInTheDocument();
    // All prices on screen simultaneously (carousel, not tabs)
    expect(screen.getByText('$9/mo')).toBeInTheDocument();
    expect(screen.getByText('$19/mo')).toBeInTheDocument();
    expect(screen.getByText('$29/mo')).toBeInTheDocument();
    // Feature copy present (now frontend-owned via PLAN_FEATURES, not plan.highlights)
    expect(screen.getByText('Advanced analytics')).toBeInTheDocument();
  });

  it('free mode: each card has an "Upgrade to <tier>" CTA that checks out that tier', async () => {
    mockGetPlans.mockResolvedValue({ plans: PLANS });
    mockStartCheckout.mockResolvedValue({ url: 'https://checkout.stripe/x' });

    render(<UpgradeModal open onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('$19/mo')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /upgrade to premium/i }));

    await waitFor(() => expect(mockStartCheckout).toHaveBeenCalledWith('w1', 'PREMIUM'));
    await waitFor(() => expect(window.location.href).toBe('https://checkout.stripe/x'));
  });

  it('shows loading state while plans fetch is pending, then the deck', async () => {
    let resolve!: (v: { plans: typeof PLANS }) => void;
    mockGetPlans.mockReturnValue(new Promise<{ plans: typeof PLANS }>((res) => { resolve = res; }));

    render(<UpgradeModal open onClose={vi.fn()} />);

    expect(screen.getByText(/loading plans/i)).toBeInTheDocument();
    resolve({ plans: PLANS });

    await waitFor(() => {
      expect(screen.queryByText(/loading plans/i)).not.toBeInTheDocument();
      expect(screen.getByText('$9/mo')).toBeInTheDocument();
    });
  });

  it('shows error state if getPlans rejects', async () => {
    mockGetPlans.mockRejectedValue(new Error('network fail'));

    render(<UpgradeModal open onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Couldn't load plans")).toBeInTheDocument());
  });

  it('shows error and skips checkout when workspaceId is undefined', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseAuth.mockImplementation((selector: any) => selector({ workspace: undefined }));
    mockGetPlans.mockResolvedValue({ plans: PLANS });

    render(<UpgradeModal open onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('$9/mo')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /upgrade to pro/i }));

    await waitFor(() =>
      expect(screen.getByText('No workspace found. Please reload and try again.')).toBeInTheDocument(),
    );
    expect(mockStartCheckout).not.toHaveBeenCalled();
  });

  it('shows the acting card button loading, and a submit error on reject', async () => {
    mockGetPlans.mockResolvedValue({ plans: PLANS });
    let rejectCheckout!: (e: Error) => void;
    mockStartCheckout.mockReturnValue(new Promise<{ url: string }>((_res, rej) => { rejectCheckout = rej; }));

    render(<UpgradeModal open onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('$9/mo')).toBeInTheDocument());
    const proBtn = screen.getByRole('button', { name: /upgrade to pro/i });
    fireEvent.click(proBtn);

    await waitFor(() => expect(proBtn).toBeDisabled());
    rejectCheckout(new Error('stripe fail'));

    await waitFor(() =>
      expect(screen.getByText("Couldn't start checkout. Please try again.")).toBeInTheDocument(),
    );
    expect(proBtn).not.toBeDisabled();
  });

  it('is a labelled carousel with position dots and arrow-key navigation', async () => {
    mockGetPlans.mockResolvedValue({ plans: PLANS });

    render(<UpgradeModal open onClose={vi.fn()} initialTier="PRO" />);

    await waitFor(() => expect(screen.getByText('$9/mo')).toBeInTheDocument());

    const carousel = screen.getByRole('group', { name: 'Plans' });
    expect(carousel).toHaveAttribute('aria-roledescription', 'carousel');
    // one dot per plan
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByRole('button', { name: /previous plan/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next plan/i })).toBeInTheDocument();

    // start focused on Pro
    expect(screen.getByRole('tab', { name: /show pro plan/i })).toHaveAttribute('aria-selected', 'true');

    // ArrowRight advances focus to Premium
    fireEvent.keyDown(carousel, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: /show premium plan/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('manage mode: current tier shows a Current plan badge + disabled CTA', async () => {
    mockGetPlans.mockResolvedValue({ plans: PLANS });

    render(<UpgradeModal open onClose={() => {}} currentTier="PRO" />);

    await waitFor(() => expect(screen.getByRole('group', { name: 'Plans' })).toBeInTheDocument());

    // Pro card marked current + its CTA disabled
    expect(screen.getByRole('button', { name: 'Current plan' })).toBeDisabled();
    expect(screen.getByText(/you're on this plan/i)).toBeInTheDocument();
  });

  it('manage mode: switching to a higher tier calls changePlan', async () => {
    mockGetPlans.mockResolvedValue({ plans: PLANS });
    mockChangePlan.mockResolvedValue({ tier: 'PREMIUM' } as never);

    render(<UpgradeModal open onClose={() => {}} currentTier="PRO" />);

    await waitFor(() => expect(screen.getByRole('group', { name: 'Plans' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /upgrade to premium/i }));

    await waitFor(() => expect(mockChangePlan).toHaveBeenCalledWith('w1', 'PREMIUM'));
  });

  it('manage mode: lower tier shows a downgrade-at-period-end note', async () => {
    mockGetPlans.mockResolvedValue({ plans: PLANS });

    render(<UpgradeModal open onClose={() => {}} currentTier="FAMILY" />);

    await waitFor(() => expect(screen.getByRole('group', { name: 'Plans' })).toBeInTheDocument());
    // Pro is a downgrade from Family
    expect(screen.getByRole('button', { name: /switch to pro/i })).toBeInTheDocument();
    expect(screen.getAllByText(/at the end of your billing period/i).length).toBeGreaterThan(0);
  });
});

// ── Feature copy (frontend-owned via PLAN_FEATURES) ─────────────────────────
// The UpgradeModal only renders the paid tiers, so the Free-tier limitation
// callout is exercised in PlanCard.test.tsx (where Free actually renders).

describe('UpgradeModal feature copy', () => {
  beforeEach(() => {
    mockGetPlans.mockResolvedValue({ plans: PLANS });
  });

  it('Pro card lists "90-day conversation memory"', async () => {
    render(<UpgradeModal open onClose={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText('90-day conversation memory')).toBeInTheDocument(),
    );
  });

  it('Pro card shows "Voice chat" with a beta badge', async () => {
    render(<UpgradeModal open onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Voice chat')).toBeInTheDocument());
    expect(screen.getByText('beta')).toBeInTheDocument();
  });

  it('Premium card shows the permanent memory dossier with its explanation', async () => {
    render(<UpgradeModal open onClose={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText('Permanent memory dossier')).toBeInTheDocument(),
    );
    expect(screen.getByText(/remembers your full financial history/i)).toBeInTheDocument();
  });

  it('Premium card shows "50 scans/day" for receipt scanning', async () => {
    render(<UpgradeModal open onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/50 scans\/day/i)).toBeInTheDocument());
  });

});
