/** Shared display formatting for money + dates. Amounts are decimal strings. */

import { CURRENCIES } from '@finby/shared';
import type { CurrencyDisplay, DateFormat, NumberFormat } from '@finby/shared';

/**
 * Format a wire-level decimal amount string for DISPLAY.
 *
 * - `display: 'SYMBOL'` (default) → currency symbol PREFIX, e.g. `"$1,234.50"`.
 *   The symbol is resolved from `CURRENCIES` by `code` (USD→`$`, PHP→`₱`, …). If
 *   the code has no known symbol, falls back to the CODE form (`"1,234.50 XYZ"`).
 * - `display: 'CODE'`  → grouped number then code suffix, e.g. `"1,234.50 USD"`
 *   (the historical form).
 * - `grouping: 'PLAIN'` → no thousands separators, e.g. `"$1234.50"`.
 *
 * Amounts travel as decimal strings on the wire and must never be parsed to a JS
 * number for storage — but for display formatting only we use `Number` + the
 * `Intl`-backed `toLocaleString` to render thousands separators consistently.
 */
export function money(
  amount: string,
  currency: string,
  opts: { display?: CurrencyDisplay; grouping?: NumberFormat } = {},
): string {
  const display = opts.display ?? 'SYMBOL';
  const grouping = opts.grouping ?? 'GROUPED';

  const n = Number(amount);
  const formatted = Number.isFinite(n)
    ? n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        useGrouping: grouping === 'GROUPED',
      })
    : amount;

  if (display === 'SYMBOL') {
    const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol;
    // Known symbol → symbol prefix; unknown code → fall back to the CODE suffix form.
    if (symbol) return `${symbol}${formatted}`;
  }

  // 'CODE' (and the SYMBOL fallback for unknown codes) → grouped number, code suffix.
  return `${formatted} ${currency}`;
}

/**
 * Format an ISO date string for DISPLAY honouring the user's date-format pref.
 *
 * - `MEDIUM` (default) → byte-identical to the historical output, e.g. `"Jun 7, 2026"`.
 * - `SHORT`  → `DD/MM/YYYY`, e.g. `"07/06/2026"` (day-first; matches the settings preview).
 * - `ISO`    → `YYYY-MM-DD`, e.g. `"2026-06-07"`.
 */
export function shortDate(iso: string, fmt: DateFormat = 'MEDIUM'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);

  if (fmt === 'ISO') {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  if (fmt === 'SHORT') {
    const day = String(d.getDate()).padStart(2, '0');
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const y = d.getFullYear();
    return `${day}/${m}/${y}`;
  }

  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Local time-of-day, e.g. "2:34 PM". */
export function timeOfDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Stable key for the local calendar day an instant falls on. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Friendly day label: "Today", "Yesterday", or "Thu, Jun 5, 2026". */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/** First day of the current month → today, as YYYY-MM-DD (UTC). */
export function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}
