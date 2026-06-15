export type DayState = 'active' | 'repaired' | 'missed';

export interface CalendarCell {
  /** YYYY-MM-DD */
  date: string;
  state: DayState;
  /** 0=Sun .. 6=Sat, for grid row placement. */
  weekday: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Flat list of cells for every day in [from, to] inclusive. Repaired beats
 *  active beats missed. Pure UTC calendar math on the date strings (which are
 *  timezone-agnostic), so no DST concerns. */
export function buildCalendarCells(
  from: string,
  to: string,
  activeDays: string[],
  repairedDays: string[],
): CalendarCell[] {
  const active = new Set(activeDays);
  const repaired = new Set(repairedDays);
  const cells: CalendarCell[] = [];

  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  let cur = Date.UTC(fy!, fm! - 1, fd!);
  const end = Date.UTC(ty!, tm! - 1, td!);

  while (cur <= end) {
    const d = new Date(cur);
    const date = d.toISOString().slice(0, 10);
    const state: DayState = repaired.has(date) ? 'repaired' : active.has(date) ? 'active' : 'missed';
    cells.push({ date, state, weekday: d.getUTCDay() });
    cur += DAY_MS;
  }
  return cells;
}
