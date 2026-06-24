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
