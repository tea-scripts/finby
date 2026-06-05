'use client';

import { Export, Plus } from '@phosphor-icons/react';

/** iOS-only guided "Add to Home Screen" sheet. Apple exposes no programmatic
 *  install on Safari, so we walk the user through the two manual steps.
 *  Mobile-only; opened from InstallBanner on iOS. */
export function InstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Install Finby"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm md:hidden"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md animate-fade-up rounded-t-3xl border border-line bg-surface px-6 pt-6 shadow-card pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-line" />
        <h2 className="text-center font-display text-xl font-bold text-ink">Install Finby</h2>
        <p className="mt-1.5 text-center text-sm text-muted">
          Add Finby to your Home Screen for a full-screen, app-like experience.
        </p>

        <ol className="mt-6 space-y-4">
          <li className="flex items-center gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Export size={22} className="motion-safe:animate-bounce" />
            </span>
            <p className="text-sm text-ink">
              Tap the <span className="font-semibold">Share</span> icon in your browser&rsquo;s
              toolbar.
            </p>
          </li>
          <li className="flex items-center gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Plus size={22} weight="bold" />
            </span>
            <p className="text-sm text-ink">
              Scroll and choose <span className="font-semibold">Add to Home Screen</span>.
            </p>
          </li>
        </ol>

        <button
          onClick={onClose}
          className="mt-7 w-full rounded-xl bg-accent py-3 text-sm font-semibold text-white transition hover:bg-accent-hover"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
