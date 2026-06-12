import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFERENCES, type UserPreferences } from '@finby/shared';
import { useFormatters } from './use-formatters';

// ── Mock the auth store ──────────────────────────────────────────────────────
// useFormatters reads `useAuth((s) => s.user?.preferences)`, so the mock state
// only needs a `user.preferences` slice. We drive it per-test via `state`.

interface MockState {
  user: { preferences: UserPreferences } | null;
}

let state: MockState;

vi.mock('@/lib/store', () => ({
  useAuth: vi.fn((selector: (s: MockState) => unknown) => selector(state)),
}));

const ISO = '2026-06-07T00:00:00.000Z';

beforeEach(() => {
  state = { user: null };
});

describe('useFormatters', () => {
  it('honours non-default preferences (ISO date, CODE + PLAIN money)', () => {
    state = {
      user: {
        preferences: {
          ...DEFAULT_PREFERENCES,
          dateFormat: 'ISO',
          currencyDisplay: 'CODE',
          numberFormat: 'PLAIN',
        },
      },
    };
    const { result } = renderHook(() => useFormatters());

    expect(result.current.formatDate(ISO)).toBe('2026-06-07');
    expect(result.current.formatMoney('1234.5', 'USD')).toBe('1234.50 USD');
  });

  it('falls back to DEFAULT_PREFERENCES when the user has none (no regression)', () => {
    state = { user: null };
    const { result } = renderHook(() => useFormatters());

    // Defaults must reproduce the historical surface output exactly.
    expect(result.current.formatDate(ISO)).toBe('Jun 7, 2026');
    expect(result.current.formatMoney('1234.5', 'USD')).toBe('$1,234.50');
  });
});
