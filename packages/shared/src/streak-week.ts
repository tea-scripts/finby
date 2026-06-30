const DAY_MS = 86_400_000;

/** The seven YYYY-MM-DD dates of the ISO week (Mon–Sun) containing `today`.
 *  Pure UTC math on the date string, which is already the user's local day. */
export function isoWeekDays(today: string): string[] {
  const [y, m, d] = today.split('-').map(Number);
  const base = Date.UTC(y!, m! - 1, d!);
  const dow = new Date(base).getUTCDay(); // 0=Sun..6=Sat
  const offsetToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = base + offsetToMonday * DAY_MS;
  return Array.from({ length: 7 }, (_, i) => new Date(monday + i * DAY_MS).toISOString().slice(0, 10));
}
