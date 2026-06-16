'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const SIZES = {
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
} as const;

/**
 * Minimal modal: dimmed backdrop (click to close) + centered panel, Escape to
 * close. Rendered through a portal to <body> so it anchors to the viewport.
 * Background scroll is locked while open; the panel scrolls internally when its
 * content is tall.
 */
export function Modal({
  open,
  onClose,
  title,
  size = 'md',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: keyof typeof SIZES;
  children: ReactNode;
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
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative z-10 flex max-h-[90dvh] w-full ${SIZES[size]} flex-col rounded-2xl border border-line bg-surface p-5 shadow-card animate-fade-up`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
