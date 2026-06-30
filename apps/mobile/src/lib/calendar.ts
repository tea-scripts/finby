/** Timezone-safe calendar math for the custom DatePicker. Never parse a date
 *  string through `new Date(str)` — that shifts by the local timezone. */
export const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export interface YMD {
  y: number;
  m: number; // 1-12
  d: number;
}

const pad = (n: number): string => String(n).padStart(2, '0');

export function parseISO(value: string): YMD | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

export function toISO(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

/** Weekday index (0=Sun) of the 1st of the month. */
export function firstWeekday(y: number, m: number): number {
  return new Date(y, m - 1, 1).getDay();
}
