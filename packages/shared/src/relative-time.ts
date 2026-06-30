/** Compact "x ago" formatting, no date library and no Intl (Hermes-safe).
 *  `now` is injectable for deterministic tests. Always counts magnitude, so
 *  future timestamps also read "… ago" — fine for ledger/unlock times (past). */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const sec = Math.round((now.getTime() - then) / 1000);
  const abs = Math.abs(sec);
  const ago = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  if (abs < 45) return 'just now';
  const min = Math.round(abs / 60);
  if (min < 45) return ago(min, 'minute');
  const hr = Math.round(abs / 3600);
  if (hr < 24) return ago(hr, 'hour');
  const day = Math.round(abs / 86400);
  if (day < 30) return ago(day, 'day');
  const month = Math.round(abs / (86400 * 30));
  if (month < 12) return ago(month, 'month');
  return ago(Math.round(abs / (86400 * 365)), 'year');
}
