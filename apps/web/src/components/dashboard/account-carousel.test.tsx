import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { type UserPreferences } from '@finby/shared';
import { AccountCarousel } from './account-carousel';
import type { SectionState } from '@/lib/dashboard-api';
import type { AccountView } from '@/lib/types';

interface MockState {
  user: { preferences: UserPreferences } | null;
}
let state: MockState;

vi.mock('@/lib/store', () => ({
  useAuth: vi.fn((selector: (s: MockState) => unknown) => selector(state)),
}));

function acct(over: Partial<AccountView>): AccountView {
  return {
    id: 'a', name: 'A', currency: 'USD', accountType: 'BANK',
    balance: '1', color: null, icon: null, isArchived: false, ...over,
  };
}

function sec(over: Partial<SectionState<AccountView[]>>): SectionState<AccountView[]> {
  return { data: null, loading: false, error: null, ...over };
}

beforeEach(() => {
  state = { user: null };
});

describe('AccountCarousel', () => {
  it('shows a skeleton (no dots) while loading', () => {
    const { container } = render(<AccountCarousel state={sec({ loading: true })} />);
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /go to slide/i })).toBeNull();
  });

  it('shows the error message', () => {
    render(<AccountCarousel state={sec({ error: 'Boom' })} />);
    expect(screen.getByText('Boom')).toBeInTheDocument();
  });

  it('shows an empty state when there are no active accounts', () => {
    render(<AccountCarousel state={sec({ data: [acct({ isArchived: true })] })} />);
    expect(screen.getByText('No accounts yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /go to slide/i })).toBeNull();
  });

  it('renders a single account without dots', () => {
    render(<AccountCarousel state={sec({ data: [acct({ id: '1', name: 'Solo' })] })} />);
    expect(screen.getByText('Solo · Bank')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /go to slide/i })).toBeNull();
  });

  it('renders dots and all cards for multiple accounts, excluding archived', () => {
    render(
      <AccountCarousel
        state={sec({
          data: [
            acct({ id: '1', name: 'One' }),
            acct({ id: '2', name: 'Two', currency: 'EUR' }),
            acct({ id: '3', name: 'Gone', isArchived: true }),
          ],
        })}
      />,
    );
    expect(screen.getAllByRole('button', { name: /go to slide/i })).toHaveLength(2);
    expect(screen.getByText('One · Bank')).toBeInTheDocument();
    expect(screen.getByText('Two · Bank')).toBeInTheDocument();
    expect(screen.queryByText('Gone · Bank')).toBeNull();
  });
});
