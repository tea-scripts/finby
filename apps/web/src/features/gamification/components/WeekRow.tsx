import { isoWeekDays } from '@finby/shared';

const LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function Check() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden="true">
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A Mon–Sun strip showing which days of the current week were logged.
 *  `today` is the user's local today (YYYY-MM-DD) — the streak calendar's `to`
 *  field — so no timezone math is needed here. */
export function WeekRow({
  activeDays,
  repairedDays,
  today,
}: {
  activeDays: string[];
  repairedDays: string[];
  today: string;
}) {
  const active = new Set([...activeDays, ...repairedDays]);
  const days = isoWeekDays(today);

  return (
    <div className="flex w-full max-w-sm justify-between" role="list" aria-label="This week">
      {days.map((date, i) => {
        const isActive = active.has(date);
        const isToday = date === today;
        const isFuture = date > today;
        const dayNum = Number(date.slice(8, 10));

        const circle = isActive
          ? `bg-amber-500 text-white${isToday ? ' ring-2 ring-amber-300/60 animate-pulse' : ''}`
          : isToday
            ? 'border-2 border-amber-400/60 text-amber-300'
            : 'border border-line text-faint';

        return (
          <div key={date} role="listitem" className="flex flex-col items-center gap-1">
            <span className="text-xs text-muted">{LABELS[i]}</span>
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${circle}`}
              aria-label={`${date}${isActive ? ' logged' : ''}`}
            >
              {isActive ? <Check /> : isFuture ? dayNum : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
