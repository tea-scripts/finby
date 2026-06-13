/** Reveals the next chunk of a pending buffer. Adaptive: drains the backlog over
 *  roughly `framesToDrain` frames (so a large backlog catches up fast), but always
 *  at least one char so a trickle still advances. Pure + testable. */
export function revealStep(
  pending: string,
  framesToDrain = 20,
): { reveal: string; rest: string } {
  if (pending.length === 0) return { reveal: '', rest: '' };
  const n = Math.max(1, Math.ceil(pending.length / framesToDrain));
  return { reveal: pending.slice(0, n), rest: pending.slice(n) };
}

export interface Typewriter {
  /** Enqueue newly-arrived text. */
  push(delta: string): void;
  /** Stop accepting input and resolve once the buffer is fully revealed. */
  finish(): Promise<void>;
  /** Abort immediately (e.g. on unmount/error); resolves any pending finish(). */
  cancel(): void;
}

/** Drives a requestAnimationFrame loop that reveals buffered text smoothly,
 *  calling `onReveal` with the cumulative revealed string on each frame that
 *  advances. Instantiate one per streamed message. */
export function createTypewriter(
  onReveal: (text: string) => void,
  opts?: { framesToDrain?: number },
): Typewriter {
  const framesToDrain = opts?.framesToDrain ?? 20;
  let pending = '';
  let revealed = '';
  let rafId: number | null = null;
  let finishResolve: (() => void) | null = null;
  let cancelled = false;

  const resolveFinish = () => {
    if (finishResolve) {
      const r = finishResolve;
      finishResolve = null;
      r();
    }
  };

  const schedule = () => {
    if (rafId === null && !cancelled) {
      rafId = requestAnimationFrame(tick);
    }
  };

  const tick = () => {
    rafId = null;
    if (cancelled) return;
    if (pending.length > 0) {
      const { reveal, rest } = revealStep(pending, framesToDrain);
      pending = rest;
      revealed += reveal;
      onReveal(revealed);
    }
    if (pending.length > 0) {
      schedule();
    } else {
      resolveFinish();
    }
  };

  return {
    push(delta) {
      if (cancelled || !delta) return;
      pending += delta;
      schedule();
    },
    finish() {
      return new Promise<void>((resolve) => {
        if (cancelled || pending.length === 0) {
          resolve();
          return;
        }
        finishResolve = resolve;
        schedule();
      });
    },
    cancel() {
      cancelled = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      resolveFinish();
    },
  };
}
