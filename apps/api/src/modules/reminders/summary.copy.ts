import { CURRENCIES } from '@finby/shared';
import type { ReminderCopy } from './reminders.copy';

/** A day's spending rollup, as produced by RemindersService.getDailySummary. */
export interface DailySummary {
  /** Total expense in the base currency, as a decimal string. */
  totalBase: string;
  /** ISO 4217 code the total is denominated in (the workspace base currency). */
  currency: string;
  /** Highest-spend category name for the day, or null if none/uncategorised. */
  topCategory: string | null;
}

const SYMBOL_BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c.symbol]));

/** "$1,250.50"-style display: currency symbol (or code) + grouped amount. */
function formatMoney(totalBase: string, currency: string): string {
  const symbol = SYMBOL_BY_CODE.get(currency) ?? currency;
  const amount = Number(totalBase).toLocaleString('en-US', { maximumFractionDigits: 2 });
  return `${symbol}${amount}`;
}

/** Compose the daily summary notification body. Picks a variant based on
 *  whether there's a top category and whether the streak is worth celebrating
 *  (>= 2). Title is always "Finby", matching reminderCopy. */
export function summaryCopy(name: string, summary: DailySummary, streak: number): ReminderCopy {
  const safe = name?.trim() || 'there';
  const money = formatMoney(summary.totalBase, summary.currency);

  let body: string;
  if (!summary.topCategory) {
    body = `${safe}, you spent ${money} today. Nice work keeping track 📊`;
  } else if (streak >= 2) {
    body = `${safe}, here's your day: ${money} spent, mostly on ${summary.topCategory}. 🔥 ${streak}-day streak — keep it going.`;
  } else {
    body = `${safe}, day logged ✓ — ${money} spent today. ${summary.topCategory} was your biggest category.`;
  }

  return { title: 'Finby', body };
}
