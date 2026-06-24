import type { AppStateStatus } from 'react-native';

/** Whether an AppState transition is a real resume from the background (the
 *  trigger for re-locking the biometric gate).
 *
 *  Crucially this must be FALSE for `inactive → active`: the OS Face ID / Touch
 *  ID / passcode dialog drops the app to `inactive` (not `background`), so
 *  treating that as a resume re-locked the app immediately after unlocking —
 *  an unlock → relock → prompt loop. Only a genuine `background → active`
 *  (home button, app switcher) re-locks. */
export function isResumeFromBackground(prev: AppStateStatus, next: AppStateStatus): boolean {
  return next === 'active' && prev === 'background';
}

/** How long the app may sit in the background before a resume re-locks it. A
 *  quick app-switcher peek, Control Center, or a notification pull backgrounds
 *  the app only briefly and should NOT force the unlock screen — only a genuinely
 *  long absence (or a cold start, handled separately by hydrate) should. */
export const LOCK_GRACE_MS = 60_000;

/** Whether a resume should re-lock: a real background → active resume AND the app
 *  was backgrounded for at least `graceMs`. `backgroundedAt`/`now` are epoch ms. */
export function shouldRelockOnResume(
  prev: AppStateStatus,
  next: AppStateStatus,
  backgroundedAt: number | null,
  now: number,
  graceMs: number = LOCK_GRACE_MS,
): boolean {
  if (!isResumeFromBackground(prev, next)) return false;
  if (backgroundedAt == null) return false;
  return now - backgroundedAt >= graceMs;
}
