'use client';

import type { Announcement } from '@/lib/announcements';
import { Lottie } from '@/components/ui/lottie';
import { Confetti } from './confetti';

/** Full-screen announcement modal. Presentational only — the host decides what
 *  the primary action does and persists dismissal. Two layouts: `simple`
 *  (branded card) and `steps` (numbered how-to). Illustration priority:
 *  lottie > image > emoji. */
export function AnnouncementModal({
  announcement,
  onPrimary,
  onRemindLater,
  busy = false,
}: {
  announcement: Announcement;
  onPrimary: () => void;
  onRemindLater: () => void;
  busy?: boolean;
}) {
  const { mode, title, body, emoji, image, lottie, hashtag, confetti, steps } = announcement;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="announcement-title"
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
    >
      {/* glassmorphism overlay: a few vibrant colour orbs floating over the live
          (transparent) app, with a frosted blur layered on top — so you see the
          real screen blurred through the glass, tinted by soft colour glows. The
          blur layer also catches the "remind me later" dismiss. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 animate-fade-in overflow-hidden">
        <div className="absolute left-[-16%] top-[8%] h-72 w-72 rounded-full bg-accent/50" />
        <div className="absolute right-[-18%] top-[34%] h-80 w-80 rounded-full bg-amber-400/40" />
        <div className="absolute bottom-[-12%] left-[20%] h-72 w-72 rounded-full bg-sky-400/35" />
        <div className="absolute right-[10%] top-[4%] h-48 w-48 rounded-full bg-fuchsia-500/25" />
      </div>
      <button
        type="button"
        aria-label="Dismiss for now"
        onClick={onRemindLater}
        className="absolute inset-0 animate-fade-in bg-ink/15 backdrop-blur-2xl"
      />

      <div className="relative w-full max-w-sm animate-pop-in overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
        {confetti ? <Confetti /> : null}
        {/* illustration stage with glow */}
        <div className="relative flex h-44 items-center justify-center overflow-hidden bg-gradient-to-b from-accent/25 to-surface">
          <div className="pointer-events-none absolute h-32 w-32 rounded-full bg-accent/30 blur-2xl" />
          <div className="relative">
            {lottie ? (
              <Lottie src={lottie} className="h-36 w-36" />
            ) : image ? (
              <img src={image} alt="" aria-hidden="true" className="h-36 w-36 object-contain" />
            ) : (
              <span className="block text-7xl" aria-hidden="true">
                {emoji ?? '✨'}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-4 p-6">
          {hashtag ? (
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">{hashtag}</p>
          ) : null}
          <div className="space-y-1.5">
            <h2 id="announcement-title" className="font-display text-2xl font-bold text-ink">
              {title}
            </h2>
            <p className="text-sm leading-relaxed text-muted">{body}</p>
          </div>

          {mode === 'steps' && steps?.length ? (
            <ol className="space-y-2.5">
              {steps.map((step, i) => (
                <li
                  key={i}
                  className="flex animate-fade-up gap-3 motion-reduce:animate-none"
                  style={{ animationDelay: `${0.12 + i * 0.08}s` }}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{step.label}</span>
                    <span className="block text-xs text-muted">{step.caption}</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : null}

          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={onPrimary}
              disabled={busy}
              className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-60"
            >
              {busy ? 'Working…' : announcement.primary.label}
            </button>
            <button
              type="button"
              onClick={onRemindLater}
              disabled={busy}
              className="w-full rounded-xl px-4 py-2 text-sm font-medium text-muted transition hover:text-ink disabled:opacity-60"
            >
              Remind me later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
