import { dayKey, dayLabel, currentMonthRange } from '@finby/core';
import type { Transaction, TransactionQuery } from '@finby/shared';

export interface DaySection {
  key: string;
  title: string;
  data: Transaction[];
}

/** Group an already-sorted (newest-first) list into consecutive same-day
 *  sections, titled "Today" / "Yesterday" / "Thu, Jun 5, 2026". */
export function groupByDay(txs: Transaction[]): DaySection[] {
  const sections: DaySection[] = [];
  for (const t of txs) {
    const key = dayKey(t.transactionDate);
    const last = sections[sections.length - 1];
    if (last && last.key === key) {
      last.data.push(t);
    } else {
      sections.push({ key, title: dayLabel(t.transactionDate), data: [t] });
    }
  }
  return sections;
}

export type DatePreset = 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_90' | 'ALL' | 'CUSTOM';

export const DATE_PRESET_OPTIONS: { value: DatePreset; label: string }[] = [
  { value: 'THIS_MONTH', label: 'This month' },
  { value: 'LAST_MONTH', label: 'Last month' },
  { value: 'LAST_90', label: 'Last 90 days' },
  { value: 'ALL', label: 'All time' },
  { value: 'CUSTOM', label: 'Custom' },
];

const iso = (d: Date): string => d.toISOString().slice(0, 10);

export function presetRange(preset: DatePreset, now: Date): { fromDate?: string; toDate?: string } {
  if (preset === 'ALL' || preset === 'CUSTOM') return {};
  if (preset === 'THIS_MONTH') {
    const range = currentMonthRange();
    return { fromDate: range.from, toDate: range.to };
  }
  if (preset === 'LAST_90') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 90));
    return { fromDate: iso(from), toDate: iso(now) };
  }
  // LAST_MONTH: the previous calendar month, 1st -> last day.
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return { fromDate: iso(from), toDate: iso(to) };
}

/** Active non-type filters, for the filter button's badge (date counts as one). */
export function activeFilterCount(q: TransactionQuery): number {
  let n = 0;
  if (q.categoryId) n += 1;
  if (q.currency) n += 1;
  if (q.fromDate || q.toDate) n += 1;
  return n;
}
