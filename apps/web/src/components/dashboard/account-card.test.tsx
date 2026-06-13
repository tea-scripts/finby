import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { type UserPreferences } from '@finby/shared';
import { AccountCard } from './account-card';
import type { AccountView } from '@/lib/types';

// useFormatters reads useAuth((s) => s.user?.preferences); drive it per-test.
interface MockState {
  user: { preferences: UserPreferences } | null;
}
let state: MockState;

vi.mock('@/lib/store', () => ({
  useAuth: vi.fn((selector: (s: MockState) => unknown) => selector(state)),
}));

const base: AccountView = {
  id: 'a1',
  name: 'Chase Checking',
  currency: 'USD',
  accountType: 'BANK',
  balance: '10000',
  color: '#14b8a6',
  icon: null,
  isArchived: false,
};

beforeEach(() => {
  state = { user: null };
});

describe('AccountCard', () => {
  it('renders the formatted balance, name·type, and currency code', () => {
    render(<AccountCard account={base} />);
    expect(screen.getByText('$10,000.00')).toBeInTheDocument();
    expect(screen.getByText('Chase Checking · Bank')).toBeInTheDocument();
    expect(screen.getByText('USD')).toBeInTheDocument();
  });

  it('uses the account color as the tint', () => {
    const { container } = render(<AccountCard account={base} />);
    expect(container.firstChild).toHaveAttribute('data-tint', '#14b8a6');
  });

  it('falls back to the accent color when color is null', () => {
    const { container } = render(<AccountCard account={{ ...base, color: null }} />);
    expect(container.firstChild).toHaveAttribute('data-tint', '#1d6ef5');
  });

  it('falls back to the accent color when color is not valid 6-digit hex', () => {
    const { container } = render(<AccountCard account={{ ...base, color: '#abc' }} />);
    expect(container.firstChild).toHaveAttribute('data-tint', '#1d6ef5');
  });

  it('shows the raw account type when it has no label mapping', () => {
    render(<AccountCard account={{ ...base, accountType: 'LEGACY' }} />);
    expect(screen.getByText('Chase Checking · LEGACY')).toBeInTheDocument();
  });
});
