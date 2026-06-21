import { previousLocalDate } from '../reminders/reminders.time';

/** Recompute streak counters from a set of active local dates (YYYY-MM-DD).
 *  Pure and order-independent. currentStreak is the consecutive run ending at
 *  the most recent active day — the same value the live incremental algorithm
 *  would have stored as of the last log. */
export function computeStreakFromActiveDays(
  activeDates: string[],
  _today?: string,
): { currentStreak: number; longestStreak: number; lastStreakDate: string | null } {
  const set = new Set(activeDates);
  if (set.size === 0) return { currentStreak: 0, longestStreak: 0, lastStreakDate: null };

  const sorted = [...set].sort(); // YYYY-MM-DD sorts chronologically

  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    if (previousLocalDate(sorted[i]!) === sorted[i - 1]) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
  }

  const last = sorted[sorted.length - 1]!;
  let current = 1;
  let cursor = last;
  while (set.has(previousLocalDate(cursor))) {
    current += 1;
    cursor = previousLocalDate(cursor);
  }

  return { currentStreak: current, longestStreak: longest, lastStreakDate: last };
}
