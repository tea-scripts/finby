import { useEffect, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuthStore } from '../../lib/use-auth-store';
import { isResumeFromBackground } from '../../lib/app-state';
import { SetPinScreen } from '../../screens/set-pin-screen';
import { UnlockScreen } from '../../screens/unlock-screen';

/** Gates the (app) group behind the app lock. With the lock on: if no PIN is set
 *  yet, force PIN setup; otherwise lock on cold start (set by hydrate) and on
 *  resume-from-background, showing the unlock screen until biometric/PIN passes. */
export function AppLockGate({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const lockEnabled = useAuthStore((s) => s.lockEnabled);
  const hasPin = useAuthStore((s) => s.hasPin);
  const locked = useAuthStore((s) => s.locked);
  const lockNow = useAuthStore((s) => s.lockNow);

  // Re-lock on a genuine background → active resume (not the inactive state the
  // OS biometric dialog causes — that would loop).
  useEffect(() => {
    let prev = AppState.currentState;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const resumed = isResumeFromBackground(prev, next);
      prev = next;
      if (resumed) lockNow();
    });
    return () => sub.remove();
  }, [lockNow]);

  if (status === 'authed' && lockEnabled && !hasPin) return <SetPinScreen />;
  if (status === 'authed' && lockEnabled && hasPin && locked) return <UnlockScreen />;
  return <>{children}</>;
}
