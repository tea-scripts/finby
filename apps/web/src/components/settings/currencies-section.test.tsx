import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CurrenciesSection } from './currencies-section';

// ── Mocks ──────────────────────────────────────────────────────────────────

interface MockWorkspace {
  id: string;
  tier: 'FREE' | 'PRO' | 'PREMIUM' | 'FAMILY';
  baseCurrency: string;
  preferredCurrencies: string[];
}

interface MockState {
  workspace: MockWorkspace;
  setPreferredCurrencies: (codes: string[]) => void;
}

const setPreferredCurrencies = vi.fn();

// Mutable holder so each test can install its own workspace before render.
let state: MockState;

vi.mock('../../lib/store', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useAuth: vi.fn((selector: (s: any) => unknown) => selector(state)),
}));

vi.mock('../../lib/settings-api', () => ({
  updateCurrencies: vi.fn(),
}));

// UpgradeGate (used in the FREE path) imports UpgradeModal, which does its own
// store/api work — stub it so the gated card renders without cascade mocks.
vi.mock('../billing/UpgradeModal', () => ({
  UpgradeModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="upgrade-modal">UpgradeModal</div> : null,
}));

import { updateCurrencies } from '../../lib/settings-api';

const mockUpdateCurrencies = vi.mocked(updateCurrencies);

function setWorkspace(ws: MockWorkspace): void {
  state = { workspace: ws, setPreferredCurrencies };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('CurrenciesSection', () => {
  it('PRO: renders chips, locks base, toggles + saves', async () => {
    setWorkspace({
      id: 'w1',
      tier: 'PRO',
      baseCurrency: 'USD',
      preferredCurrencies: ['USD'],
    });
    mockUpdateCurrencies.mockResolvedValue({ preferredCurrencies: ['USD', 'EUR'] });

    render(<CurrenciesSection />);

    // Base chip is present and cannot be deselected (disabled).
    const usdChip = screen.getByRole('button', { name: /USD/ });
    expect(usdChip).toBeInTheDocument();
    expect(usdChip).toBeDisabled();
    expect(usdChip).toHaveAttribute('aria-pressed', 'true');

    // Clicking the locked base chip is a no-op (still pressed).
    fireEvent.click(usdChip);
    expect(usdChip).toHaveAttribute('aria-pressed', 'true');

    // Toggle EUR on.
    const eurChip = screen.getByRole('button', { name: /EUR/ });
    fireEvent.click(eurChip);
    expect(eurChip).toHaveAttribute('aria-pressed', 'true');

    // Save.
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      expect(mockUpdateCurrencies).toHaveBeenCalledWith(
        'w1',
        expect.arrayContaining(['USD', 'EUR']),
      );
    });
    await waitFor(() => {
      expect(setPreferredCurrencies).toHaveBeenCalledWith(['USD', 'EUR']);
    });
  });

  it('FREE: shows the gated upgrade UI, no interactable multi-select', () => {
    setWorkspace({
      id: 'w1',
      tier: 'FREE',
      baseCurrency: 'USD',
      preferredCurrencies: ['USD'],
    });

    render(<CurrenciesSection />);

    // UpgradeGate affordances: the feature name + an Upgrade button.
    expect(screen.getByText('Multiple currencies')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upgrade/i })).toBeInTheDocument();

    // The PRO multi-select is gated away — no Save / no EUR chip.
    expect(screen.queryByRole('button', { name: /^Save$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /EUR/ })).not.toBeInTheDocument();
  });
});
