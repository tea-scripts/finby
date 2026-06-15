/** Compact "x ago" formatting without a date library. `now` is injectable for
 *  deterministic tests. Returns e.g. "just now", "3 days ago", "2 months ago". */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = now.getTime() - then;
  const sec = Math.round(diffMs / 1000);

  const fmt = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const abs = Math.abs(sec);

  if (abs < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (Math.abs(min) < 45) return fmt.format(-min, 'minute');
  const hr = Math.round(sec / 3600);
  if (Math.abs(hr) < 24) return fmt.format(-hr, 'hour');
  const day = Math.round(sec / 86400);
  if (Math.abs(day) < 30) return fmt.format(-day, 'day');
  const month = Math.round(sec / (86400 * 30));
  if (Math.abs(month) < 12) return fmt.format(-month, 'month');
  const year = Math.round(sec / (86400 * 365));
  return fmt.format(-year, 'year');
}
