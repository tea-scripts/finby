'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/store';
import { getStreakCalendar } from '@/lib/streaks-api';
import { buildCalendarCells, type CalendarCell, type DayState } from '@/lib/streak-calendar';

const STATE_CLASS: Record<DayState, string> = {
  // Logged = amber, matching the flame/streak theme and the WeekRow above it.
  // Repaired = a distinct blue "rescued" state. Missed = muted grid colour.
  active: 'bg-amber-500',
  repaired: 'bg-accent ring-1 ring-accent/50',
  missed: 'bg-line',
};

const STATE_LABEL: Record<DayState, string> = {
  active: 'logged',
  repaired: 'repaired',
  missed: 'missed',
};

/** Activity heatmap for the user's streak. Self-fetches the last ~6 months and
 *  renders a 7-row (weekday) grid that flows by column (week). The first cell
 *  is offset to its weekday so columns line up like a wall calendar. */
export function StreakCalendar() {
  const workspaceId = useAuth((s) => s.workspace?.id);
  const [cells, setCells] = useState<CalendarCell[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    getStreakCalendar(workspaceId)
      .then((cal) => {
        if (cancelled) return;
        setCells(buildCalendarCells(cal.from, cal.to, cal.activeDays, cal.repairedDays));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  if (!workspaceId) return null;
  if (failed) return <p className="text-xs text-muted">Couldn&apos;t load your calendar.</p>;
  if (!cells) return <p className="text-xs text-faint">Loading…</p>;

  // Number of week-columns, including the leading offset to the first cell's
  // weekday. The grid stretches these columns to fill the container width so the
  // whole ~6-month heatmap fits without horizontal scrolling on any screen.
  const numWeeks = Math.ceil(((cells[0]?.weekday ?? 0) + cells.length) / 7);

  return (
    <div className="space-y-3">
      <div
        className="grid w-full grid-flow-col gap-[3px]"
        style={{
          gridTemplateRows: 'repeat(7, auto)',
          gridTemplateColumns: `repeat(${numWeeks}, minmax(0, 1fr))`,
        }}
        role="list"
        aria-label="Streak activity calendar"
      >
        {cells.map((cell, i) => (
          <span
            key={cell.date}
            role="listitem"
            aria-label={`${cell.date}: ${STATE_LABEL[cell.state]}`}
            className={`aspect-square w-full rounded-sm ${STATE_CLASS[cell.state]}`}
            style={i === 0 ? { gridRowStart: cell.weekday + 1 } : undefined}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-amber-500" /> Logged
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-accent ring-1 ring-accent/50" /> Repaired
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-line" /> Missed
        </span>
      </div>
    </div>
  );
}
