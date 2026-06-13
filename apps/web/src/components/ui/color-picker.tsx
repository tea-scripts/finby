'use client';

import { type KeyboardEvent, useRef } from 'react';

/** Curated palette for account colors — distinct hues that read well as card
 *  tints on the dark theme. */
export const ACCOUNT_COLORS = [
  { hex: '#ef4444', name: 'Red' },
  { hex: '#f97316', name: 'Orange' },
  { hex: '#f5a524', name: 'Amber' },
  { hex: '#1fae6a', name: 'Green' },
  { hex: '#14b8a6', name: 'Teal' },
  { hex: '#1d6ef5', name: 'Blue' },
  { hex: '#7c5cff', name: 'Violet' },
  { hex: '#ec4899', name: 'Pink' },
] as const;

interface ColorPickerProps {
  value: string | null;
  onChange: (color: string | null) => void;
  label?: string;
}

/** Accessible swatch picker (radiogroup) for an account color. The first option
 *  ("Default") clears back to null → the card uses the app accent. Keyboard:
 *  ←/→/↑/↓ move and select, matching native radio-group behaviour. */
export function ColorPicker({ value, onChange, label = 'Color' }: ColorPickerProps) {
  const current = value || null; // treat '' and null alike → Default
  const options: { key: string; hex: string | null; name: string }[] = [
    { key: 'default', hex: null, name: 'Default' },
    ...ACCOUNT_COLORS.map((c) => ({ key: c.hex, hex: c.hex as string | null, name: c.name })),
  ];
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function select(i: number) {
    const n = options.length;
    const idx = ((i % n) + n) % n;
    const opt = options[idx];
    if (!opt) return;
    refs.current[idx]?.focus();
    onChange(opt.hex);
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      select(i + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      select(i - 1);
    }
  }

  // The selected option owns the single roving tabstop (Default when none).
  const selectedIndex = Math.max(
    options.findIndex((o) => o.hex === current),
    0,
  );

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-2">
      {options.map((opt, i) => {
        const selected = opt.hex === current;
        return (
          <button
            key={opt.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={opt.name}
            tabIndex={i === selectedIndex ? 0 : -1}
            onClick={() => select(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`flex h-7 w-7 items-center justify-center rounded-full border transition ${
              selected ? 'border-ink ring-2 ring-ink/40' : 'border-line hover:border-muted'
            } ${opt.hex === null ? 'bg-surface-2 text-faint' : ''}`}
            style={opt.hex ? { backgroundColor: opt.hex } : undefined}
          >
            {opt.hex === null ? (
              <span aria-hidden className="text-[10px] leading-none">
                ∅
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
