import { localDayInfo } from '../reminders/reminders.time';

/** Unique local-day dates (YYYY-MM-DD) for the given instants, resolved in the
 *  user's timezone — matching how the streak credits a day (createdAt-aligned).
 *  Invalid timezone falls back to UTC. Sorted ascending. */
export function bucketLocalDays(dates: Date[], timezone: string): string[] {
  const set = new Set<string>();
  for (const d of dates) {
    try {
      set.add(localDayInfo(d, timezone).date);
    } catch {
      set.add(localDayInfo(d, 'UTC').date);
    }
  }
  return [...set].sort();
}
