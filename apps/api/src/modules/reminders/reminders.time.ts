export interface LocalDayInfo {
  /** Local hour 0-23 at the given instant. */
  hour: number;
  /** Local calendar date as YYYY-MM-DD. */
  date: string;
  /** UTC epoch ms of local midnight (start of that local day). */
  startOfDayMs: number;
}

/** Resolve an instant into local-day info for an IANA timezone, with no
 *  external date library. Throws if the timezone is invalid. */
export function localDayInfo(now: Date, timeZone: string): LocalDayInfo {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(now)) parts[p.type] = p.value;

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const second = Number(parts.second);

  // The local wall-clock reinterpreted as if it were UTC.
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  // Positive when the timezone is ahead of UTC.
  const offsetMs = asUtc - now.getTime();
  const startOfDayMs = Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMs;

  return { hour, date: `${parts.year}-${parts.month}-${parts.day}`, startOfDayMs };
}
