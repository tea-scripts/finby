import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BaseCurrencySection } from './base-currency-section';

const setBaseCurrency = vi.fn();
let workspace: { id: string; baseCurrency: string; preferredCurrencies: string[] } | null;

vi.mock('@/lib/store', () => ({
  useAuth: (sel: (s: unknown) => unknown) => sel({ workspace, setBaseCurrency }),
}));

const updateBaseCurrency = vi.fn();
vi.mock('@/lib/settings-api', () => ({
  updateBaseCurrency: (...args: unknown[]) => updateBaseCurrency(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  workspace = { id: 'ws1', baseCurrency: 'USD', preferredCurrencies: ['USD'] };
});

// The Dropdown is a custom button/listbox (not a native <select>), so we pick a
// value by opening the listbox via its trigger and clicking the option, rather
// than firing a `change` event on a <select>.
function selectCurrency(code: string) {
  fireEvent.click(screen.getByLabelText(/base currency/i));
  const option = screen
    .getAllByRole('option')
    .find((el) => el.textContent?.startsWith(code));
  if (!option) throw new Error(`option ${code} not found`);
  fireEvent.click(option);
}

describe('BaseCurrencySection', () => {
  it('requires confirmation before changing the base currency', async () => {
    updateBaseCurrency.mockResolvedValue({
      baseCurrency: 'NGN',
      preferredCurrencies: ['USD', 'NGN'],
      recomputed: 3,
    });
    render(<BaseCurrencySection />);

    selectCurrency('NGN');

    fireEvent.click(screen.getByRole('button', { name: /change base currency/i }));
    expect(updateBaseCurrency).not.toHaveBeenCalled();
    expect(screen.getByText(/recalculate/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^confirm/i }));

    await waitFor(() => expect(updateBaseCurrency).toHaveBeenCalledWith('ws1', 'NGN'));
    await waitFor(() => expect(setBaseCurrency).toHaveBeenCalledWith('NGN', ['USD', 'NGN']));
  });

  it('does not offer a change while the selection equals the current base', () => {
    render(<BaseCurrencySection />);
    expect(screen.queryByRole('button', { name: /change base currency/i })).toBeDisabled();
  });
});
