'use client';

import { useState } from 'react';
import { Star } from '@phosphor-icons/react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { submitFeedback } from '@/lib/feedback-api';
import { track } from '@/lib/analytics';

type Status = 'idle' | 'submitting' | 'done' | 'error';

/** "Write a review" — a star rating + optional note, posted to the feedback
 *  endpoint. Lives in Settings so users can share feedback any time. */
export function FeedbackSection() {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  function reset() {
    setRating(0);
    setHover(0);
    setComment('');
    setStatus('idle');
  }

  function close() {
    setOpen(false);
    // Let the close animation finish before clearing, so it doesn't flash.
    setTimeout(reset, 200);
  }

  async function submit() {
    if (rating < 1) return;
    setStatus('submitting');
    try {
      await submitFeedback(rating, comment);
      track('feedback_submitted', { rating });
      setStatus('done');
    } catch {
      setStatus('error');
    }
  }

  const active = hover || rating;

  return (
    <section className="space-y-3">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
        Feedback
      </h2>
      <div className="flex items-center justify-between rounded-2xl border border-line bg-surface/60 p-5 shadow-card">
        <div className="pr-4">
          <p className="text-sm font-medium text-ink">Enjoying Finby?</p>
          <p className="text-sm text-muted">Tell us what you love or what we can do better.</p>
        </div>
        <Button variant="ghost" onClick={() => setOpen(true)} className="shrink-0">
          Write a review
        </Button>
      </div>

      <Modal open={open} onClose={close} title="Write a review">
        {status === 'done' ? (
          <div className="py-4 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft">
              <Star size={26} weight="fill" className="text-accent" />
            </div>
            <p className="text-base font-medium text-ink">Thank you!</p>
            <p className="mt-1 text-sm text-muted">Your feedback helps us make Finby better.</p>
            <Button variant="primary" onClick={close} className="mt-5 w-full">
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted">How would you rate your experience?</p>

            <div className="flex justify-center gap-2" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={`${n} star${n === 1 ? '' : 's'}`}
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(0)}
                  className="rounded-lg p-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  <Star
                    size={34}
                    weight={n <= active ? 'fill' : 'regular'}
                    className={n <= active ? 'text-accent' : 'text-muted'}
                  />
                </button>
              ))}
            </div>

            <Textarea
              aria-label="Review comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="Anything you'd like us to know? (optional)"
              className="resize-none"
            />

            {status === 'error' && (
              <p className="text-center text-sm text-red-400">
                Couldn&apos;t send your review. Please try again.
              </p>
            )}

            <Button
              variant="primary"
              loading={status === 'submitting'}
              disabled={rating < 1 || status === 'submitting'}
              onClick={submit}
              className="w-full"
            >
              Submit review
            </Button>
          </div>
        )}
      </Modal>
    </section>
  );
}
