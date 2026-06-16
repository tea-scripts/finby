'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

interface DatePickerProps {
  /** ISO date string 'YYYY-MM-DD', or '' when unset. */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Show a clear (x) control when a value is set. */
  clearable?: boolean;
  'aria-label'?: string;
}

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

interface YMD {
  y: number;
  m: number; // 1-12
  d: number;
}

/** Parse 'YYYY-MM-DD' without going through Date() (which would shift by timezone). */
function parseISO(value: string): YMD | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toISO(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function formatShort({ y, m, d }: YMD): string {
  return `${MONTHS_SHORT[m - 1]} ${d}, ${y}`;
}

function formatLong(y: number, m: number, d: number): string {
  return `${MONTHS_LONG[m - 1]} ${d}, ${y}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

/** Weekday index (0=Sun) of the 1st of the month. */
function firstWeekday(y: number, m: number): number {
  return new Date(y, m - 1, 1).getDay();
}

/** Custom (non-native) date picker: a styled trigger that opens a calendar
 *  popover. Replaces native <input type="date"> for consistent cross-OS UI. */
export function DatePicker({
  value,
  onChange,
  id,
  placeholder = 'Select date…',
  className = '',
  disabled = false,
  clearable = false,
  'aria-label': ariaLabel,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = parseISO(value);

  // The month currently shown in the grid. Defaults to the selected date's
  // month, else the current month.
  const initialView = (): { y: number; m: number } => {
    if (selected) return { y: selected.y, m: selected.m };
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() + 1 };
  };
  const [view, setView] = useState(initialView);

  // Re-sync the view to the selected month whenever the calendar is opened.
  useEffect(() => {
    if (open) setView(initialView());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function shiftMonth(delta: number) {
    setView((v) => {
      const zero = v.m - 1 + delta; // 0-based month, may go out of range
      const y = v.y + Math.floor(zero / 12);
      const m = (((zero % 12) + 12) % 12) + 1;
      return { y, m };
    });
  }

  function choose(day: number) {
    onChange(toISO(view.y, view.m, day));
    setOpen(false);
  }

  function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
    } else if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setOpen(true);
    }
  }

  const total = daysInMonth(view.y, view.m);
  const lead = firstWeekday(view.y, view.m);
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];

  function isSelected(day: number): boolean {
    return (
      selected != null && selected.y === view.y && selected.m === view.m && selected.d === day
    );
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <div className="flex items-stretch gap-1">
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={ariaLabel}
          onClick={() => setOpen((o) => !o)}
          onKeyDown={onTriggerKeyDown}
          className="flex w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-line bg-canvas/60 px-3.5 py-2.5 text-left text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className={`truncate ${selected ? 'text-ink' : 'text-faint'}`}>
            {selected ? formatShort(selected) : placeholder}
          </span>
          <CalendarIcon />
        </button>
        {clearable && selected && !disabled ? (
          <button
            type="button"
            aria-label="Clear date"
            onClick={() => onChange('')}
            className="shrink-0 rounded-xl border border-line bg-canvas/60 px-2.5 text-faint transition hover:text-ink"
          >
            ×
          </button>
        ) : null}
      </div>

      {open && (
        <div
          role="dialog"
          aria-label="Choose date"
          className="absolute z-20 mt-1.5 w-64 rounded-xl border border-line bg-surface p-3 shadow-card"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => shiftMonth(-1)}
              className="rounded-lg px-2 py-1 text-muted transition hover:bg-surface-2 hover:text-ink"
            >
              ‹
            </button>
            <span className="text-sm font-medium text-ink">
              {MONTHS_LONG[view.m - 1]} {view.y}
            </span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => shiftMonth(1)}
              className="rounded-lg px-2 py-1 text-muted transition hover:bg-surface-2 hover:text-ink"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center">
            {WEEKDAYS.map((w) => (
              <span key={w} className="py-1 text-[11px] font-medium text-faint">
                {w}
              </span>
            ))}
            {cells.map((day, i) =>
              day === null ? (
                <span key={`pad-${i}`} aria-hidden="true" />
              ) : (
                <button
                  key={day}
                  type="button"
                  aria-label={formatLong(view.y, view.m, day)}
                  aria-pressed={isSelected(day)}
                  onClick={() => choose(day)}
                  className={`rounded-lg py-1.5 text-sm transition hover:bg-surface-2 ${
                    isSelected(day)
                      ? 'bg-accent font-medium text-white hover:bg-accent-hover'
                      : 'text-ink'
                  }`}
                >
                  {day}
                </button>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-muted">
      <rect x="3" y="4.5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 9h18M8 3v3m8-3v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
