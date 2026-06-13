'use client';

import { useRef, useState, type ReactNode, type PointerEvent, type KeyboardEvent } from 'react';

const SWIPE_RATIO = 0.25; // fraction of viewport width that commits a slide change

interface CarouselProps {
  children: ReactNode[];
  ariaLabel: string;
  showDots?: boolean;
  initialIndex?: number;
  onIndexChange?: (index: number) => void;
}

/** Generic one-slide carousel: drag to swipe, click dots, ←/→ keys. No external deps. */
export function Carousel({
  children,
  ariaLabel,
  showDots = true,
  initialIndex = 0,
  onIndexChange,
}: CarouselProps) {
  const slides = Array.isArray(children) ? children : [children];
  const count = slides.length;
  const clamp = (n: number) => Math.min(Math.max(n, 0), Math.max(count - 1, 0));

  const [index, setIndex] = useState(() => clamp(initialIndex));
  const [dragging, setDragging] = useState(false);
  const [drag, setDrag] = useState(0);
  const startX = useRef(0);
  const viewport = useRef<HTMLDivElement>(null);

  function go(next: number) {
    const c = clamp(next);
    if (c !== index) {
      setIndex(c);
      onIndexChange?.(c);
    }
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    setDragging(true);
    startX.current = e.clientX;
    viewport.current?.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (dragging) setDrag(e.clientX - startX.current);
  }
  function onPointerEnd(e: PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setDragging(false);
    const delta = e.clientX - startX.current;
    const width = viewport.current?.offsetWidth ?? 1;
    if (delta <= -width * SWIPE_RATIO) go(index + 1);
    else if (delta >= width * SWIPE_RATIO) go(index - 1);
    setDrag(0);
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(index + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(index - 1);
    }
  }

  return (
    <div
      role="group"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="w-full min-w-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div
        ref={viewport}
        className="w-full touch-pan-y overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <div
          className={`flex ${dragging ? '' : 'transition-transform duration-300 ease-out'}`}
          style={{ transform: `translateX(calc(${-index * 100}% + ${drag}px))` }}
        >
          {slides.map((slide, i) => (
            <div
              key={i}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}`}
              aria-hidden={i !== index}
              inert={i !== index || undefined}
              className="w-full shrink-0"
            >
              {slide}
            </div>
          ))}
        </div>
      </div>

      <p aria-live="polite" className="sr-only">{`Slide ${index + 1} of ${count}`}</p>

      {showDots && count > 1 && (
        <div className="mt-3 flex justify-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => go(i)}
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === index}
              className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-accent' : 'w-1.5 bg-line'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
