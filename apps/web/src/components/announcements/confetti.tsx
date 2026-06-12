import type { CSSProperties } from 'react';

/** Zero-dependency confetti burst that falls the full height of the modal.
 *  Pieces are deterministic (index-derived → no hydration mismatch); the whole
 *  layer is hidden under prefers-reduced-motion via `motion-reduce:hidden`.
 *  Distance/drift/spin are passed per-piece as CSS vars the keyframe reads. */

const COLORS = ['#FF6A00', '#FFB238', '#1D6EF5', '#34D399', '#F472B6', '#FFE9A8', '#FFFFFF'];

const PIECES = Array.from({ length: 26 }, (_, i) => ({
  left: (i * 37) % 100, // spread across the width
  delay: (i % 9) * 0.06, // staggered burst
  duration: 1.5 + (i % 6) * 0.22,
  color: COLORS[i % COLORS.length],
  width: 5 + (i % 3) * 3,
  round: i % 3 === 0, // mix of circles and rectangles
  fall: 380 + (i % 5) * 70, // px — crosses the whole card
  drift: ((i % 7) - 3) * 16, // px sideways
  spin: 360 + (i % 5) * 160, // deg
}));

export function Confetti() {
  return (
    <div
      aria-hidden="true"
      data-testid="confetti"
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden motion-reduce:hidden"
    >
      {PIECES.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 block animate-confetti-fall"
          style={
            {
              left: `${p.left}%`,
              width: p.width,
              height: p.round ? p.width : p.width * 0.5,
              background: p.color,
              borderRadius: p.round ? '9999px' : '1px',
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              '--cy': `${p.fall}px`,
              '--cx': `${p.drift}px`,
              '--cr': `${p.spin}deg`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
