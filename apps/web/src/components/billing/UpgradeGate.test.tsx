import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UpgradeGate } from './UpgradeGate';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../lib/store', () => ({
  useAuth: vi.fn((selector: (s: { workspace?: { tier: string } }) => unknown) =>
    selector({ workspace: { tier: 'FREE' } }),
  ),
}));

vi.mock('./UpgradeModal', () => ({
  UpgradeModal: ({ open }: { open: boolean }) =>
    open ? <div>upgrade-modal-open</div> : null,
}));

import { useAuth } from '../../lib/store';

const mockUseAuth = vi.mocked(useAuth);

function setTier(tier: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockUseAuth.mockImplementation((selector: any) =>
    selector({ workspace: { tier } }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setTier('FREE');
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('UpgradeGate', () => {
  it('renders children when user tier meets requirement (exact match)', () => {
    setTier('PRO');

    render(
      <UpgradeGate requiredTier="PRO" featureName="Advanced Reports">
        <div>secret feature</div>
      </UpgradeGate>,
    );

    expect(screen.getByText('secret feature')).toBeInTheDocument();
    expect(screen.queryByText('Advanced Reports')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /upgrade/i })).not.toBeInTheDocument();
  });

  it('renders children when user tier exceeds requirement (PREMIUM satisfies PRO)', () => {
    setTier('PREMIUM');

    render(
      <UpgradeGate requiredTier="PRO" featureName="Advanced Reports">
        <div>secret feature</div>
      </UpgradeGate>,
    );

    expect(screen.getByText('secret feature')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /upgrade/i })).not.toBeInTheDocument();
  });

  it('renders gate UI when user tier is below requirement', () => {
    setTier('FREE');

    render(
      <UpgradeGate requiredTier="PRO" featureName="Advanced Reports">
        <div>secret feature</div>
      </UpgradeGate>,
    );

    expect(screen.queryByText('secret feature')).not.toBeInTheDocument();
    expect(screen.getByText('Advanced Reports')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upgrade/i })).toBeInTheDocument();
  });

  it('opens the upgrade modal when Upgrade button is clicked', () => {
    setTier('FREE');

    render(
      <UpgradeGate requiredTier="PRO" featureName="Advanced Reports">
        <div>secret feature</div>
      </UpgradeGate>,
    );

    expect(screen.queryByText('upgrade-modal-open')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /upgrade/i }));

    expect(screen.getByText('upgrade-modal-open')).toBeInTheDocument();
  });
});
