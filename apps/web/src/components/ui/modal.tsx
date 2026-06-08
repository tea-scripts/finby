'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Minimal modal: backdrop (click to close) + centered panel, Escape to close.
 *
 * Rendered through a portal to <body> so it anchors to the viewport. A plain
 * `position: fixed` element anchors to the nearest ancestor that has a
 * transform/filter (e.g. the page-level `animate-fade-up`), which would center
 * the modal on the whole page instead of the screen. Background scroll is
 * locked while open, and the panel scrolls internally when content is tall.
 *
 * Pass `bare` to drop the panel chrome (box, border, title heading, close
 * button) and render the children directly on the dimmed backdrop — used when
 * the content (e.g. a plan carousel) is already its own self-contained card UI.
 * Bare modals close via backdrop tap or Escape.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  bare = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  bare?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      {bare ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="relative z-10 max-h-[90dvh] w-full max-w-md overflow-y-auto animate-fade-up"
        >
          {children}
        </div>
      ) : (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="relative z-10 flex max-h-[90dvh] w-full max-w-md flex-col rounded-2xl border border-line bg-surface p-5 shadow-card animate-fade-up"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
            >
              ✕
            </button>
          </div>
          <div className="min-h-0 overflow-y-auto">{children}</div>
        </div>
      )}
    </div>,
    document.body,
  );
}
