import { useEffect, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuthStore } from '../../lib/use-auth-store';
import { shouldRelockOnResume, LOCK_GRACE_MS } from '../../lib/app-state';
import { SetPinScreen } from '../../screens/set-pin-screen';
import { UnlockScreen } from '../../screens/unlock-screen';

/** Gates the (app) group behind the app lock. With the lock on: if no PIN is set
 *  yet, force PIN setup; otherwise lock on cold start (set by hydrate) and on a
 *  resume after the app has been backgrounded past the grace period, showing the
 *  unlock screen until biometric/PIN passes. A quick app-switcher peek, Control
 *  Center, or a notification pull does NOT re-lock. */
export function AppLockGate({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const lockEnabled = useAuthStore((s) => s.lockEnabled);
  const hasPin = useAuthStore((s) => s.hasPin);
  const locked = useAuthStore((s) => s.locked);
  const lockNow = useAuthStore((s) => s.lockNow);

  // Re-lock only on a genuine background → active resume that exceeded the grace
  // period — never on the `inactive` state the OS biometric dialog causes (that
  // would loop), and not for momentary backgrounding (app switcher, etc.).
  useEffect(() => {
    let prev = AppState.currentState;
    let backgroundedAt: number | null = null;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (shouldRelockOnResume(prev, next, backgroundedAt, Date.now(), LOCK_GRACE_MS)) {
        lockNow();
      }
      if (next === 'background') backgroundedAt = Date.now();
      prev = next;
    });
    return () => sub.remove();
  }, [lockNow]);

  if (status === 'authed' && lockEnabled && !hasPin) return <SetPinScreen />;
  if (status === 'authed' && lockEnabled && hasPin && locked) return <UnlockScreen />;
  return <>{children}</>;
}
