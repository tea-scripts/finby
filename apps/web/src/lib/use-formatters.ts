'use client';

import { DEFAULT_PREFERENCES } from '@finby/shared';
import { money, shortDate } from './format';
import { useAuth } from './store';

/**
 * Preference-aware date/money formatters.
 *
 * Reads the signed-in user's display preferences from the auth store and falls
 * back to {@link DEFAULT_PREFERENCES} when absent (logged out / older sessions).
 * At default preferences the outputs are byte-identical to the historical
 * `shortDate(iso)` / `money(amount, currency)` behaviour — no visual regression.
 */
export function useFormatters() {
  const prefs = useAuth((s) => s.user?.preferences) ?? DEFAULT_PREFERENCES;
  return {
    formatDate: (iso: string) => shortDate(iso, prefs.dateFormat),
    formatMoney: (amount: string, currency: string) =>
      money(amount, currency, { display: prefs.currencyDisplay, grouping: prefs.numberFormat }),
  };
}
