import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransactionFilters } from './transaction-filters';
import type { TransactionQuery } from '@/lib/types';

// ── Mocks ──────────────────────────────────────────────────────────────────

interface MockState {
  workspace: { preferredCurrencies: string[] } | null;
}

let state: MockState;

vi.mock('@/lib/store', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useAuth: vi.fn((selector: (s: any) => unknown) => selector(state)),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

const defaultFilters: TransactionQuery = {};

function renderFilters(filters: TransactionQuery = defaultFilters) {
  const onChange = vi.fn();
  render(
    <TransactionFilters
      filters={filters}
      categories={[]}
      onChange={onChange}
    />,
  );
  return { onChange };
}

function openCurrencyDropdown() {
  fireEvent.click(screen.getByRole('button', { name: /filter by currency/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('TransactionFilters — currency dropdown', () => {
  it('shows preferred currencies when workspace has preferredCurrencies set', () => {
    state = { workspace: { preferredCurrencies: ['USD', 'EUR'] } };

    renderFilters();
    openCurrencyDropdown();

    // The "All currencies" sentinel must always be present.
    expect(screen.getByRole('option', { name: 'All currencies' })).toBeInTheDocument();

    // Preferred currencies must appear.
    expect(screen.getByRole('option', { name: 'USD' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'EUR' })).toBeInTheDocument();

    // A currency outside the preferred set must NOT appear.
    expect(screen.queryByRole('option', { name: 'JPY' })).not.toBeInTheDocument();
  });

  it('falls back to all CURRENCY_CODES when preferredCurrencies is empty', () => {
    state = { workspace: { preferredCurrencies: [] } };

    renderFilters();
    openCurrencyDropdown();

    // With no preferred set, the full shared list is used — JPY is in it.
    expect(screen.getByRole('option', { name: 'JPY' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'USD' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'All currencies' })).toBeInTheDocument();
  });

  it('falls back to all CURRENCY_CODES when workspace is null', () => {
    state = { workspace: null };

    renderFilters();
    openCurrencyDropdown();

    expect(screen.getByRole('option', { name: 'JPY' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'All currencies' })).toBeInTheDocument();
  });
});

describe('TransactionFilters — date pickers', () => {
  it('uses the custom DatePicker (not a native date input) and emits an ISO fromDate', () => {
    state = { workspace: { preferredCurrencies: ['USD'] } };
    const onChange = vi.fn();
    render(
      <TransactionFilters filters={{ fromDate: '2026-06-13' }} categories={[]} onChange={onChange} />,
    );

    // Open the From calendar and pick a day.
    fireEvent.click(screen.getByRole('button', { name: /filter from date/i }));
    fireEvent.click(screen.getByRole('button', { name: 'June 20, 2026' }));

    expect(onChange).toHaveBeenCalledWith({ fromDate: '2026-06-20' });
  });
});
