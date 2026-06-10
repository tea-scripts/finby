import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { UserPreferences } from '@finby/shared';
import { AccountList } from './account-list';
import type { SectionState } from '@/lib/dashboard-api';
import type { AccountView } from '@/lib/types';

// useFormatters reads `useAuth((s) => s.user?.preferences)`; drive it per-test.
interface MockState {
  user: { preferences: UserPreferences } | null;
}
let state: MockState;

vi.mock('@/lib/store', () => ({
  useAuth: vi.fn((selector: (s: MockState) => unknown) => selector(state)),
}));

const account: AccountView = {
  id: 'a1',
  name: 'Checking',
  accountType: 'CHECKING',
  balance: '1234.5',
  currency: 'USD',
  isArchived: false,
} as AccountView;

const loaded: SectionState<AccountView[]> = { loading: false, error: null, data: [account] };

beforeEach(() => {
  state = { user: null };
});

describe('AccountList preference-aware money', () => {
  it('renders the CODE money form when the user prefers CODE display', () => {
    state = {
      user: {
        preferences: {
          dateFormat: 'MEDIUM',
          currencyDisplay: 'CODE',
          numberFormat: 'GROUPED',
          dailyReminders: true,
          lastDailyReminderAt: null,
        },
      },
    };

    render(<AccountList state={loaded} />);

    expect(screen.getByText('1,234.50 USD')).toBeInTheDocument();
  });

  it('falls back to the SYMBOL default when the user has no preferences', () => {
    state = { user: null };

    render(<AccountList state={loaded} />);

    expect(screen.getByText('$1,234.50')).toBeInTheDocument();
  });
});
