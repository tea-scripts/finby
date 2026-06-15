'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * Right-anchored slide-in drawer. Mirrors modal.tsx: portal to <body> (so it
 * anchors to the viewport, not a transformed ancestor), Escape to close,
 * background scroll-lock while open, and an SSR-safe `mounted` guard.
 */
export function Drawer({ open, onClose, title, children }: DrawerProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!mounted) return null;
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={[
          'relative z-10 flex h-full w-full max-w-sm flex-col',
          'border-l border-line bg-surface',
          'shadow-[-8px_0_32px_rgba(0,0,0,0.4)]',
          'animate-slide-in-right',
        ].join(' ')}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
