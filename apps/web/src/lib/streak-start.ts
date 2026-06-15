import type { PushState } from './push';

export const STREAK_START_SHOWN_KEY = 'finby_streak_start_shown';

/** Show the day-0 reminder prompt only on the very first streak day, once ever,
 *  and only when the user isn't already subscribed to push. A 'denied' state
 *  still qualifies because the iOS install path is a separate route to reminders. */
export function shouldPromptStreakStart(
  streak: number,
  pushState: PushState,
  alreadyShown: boolean,
): boolean {
  if (alreadyShown) return false;
  if (streak !== 1) return false;
  return pushState !== 'on';
}
