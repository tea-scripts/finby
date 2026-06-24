import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { AppState, type AppStateStatus, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../ui/button';
import { useAuthStore } from '../../lib/use-auth-store';
import { biometric } from '../../lib/runtime.native';

/** Gates the (app) group behind a biometric unlock. The store locks the app on
 *  cold start (in hydrate) and this component re-locks on resume-from-background;
 *  no app content renders while locked. The OS passcode is the system fallback. */
export function BiometricGate({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const lockEnabled = useAuthStore((s) => s.lockEnabled);
  const locked = useAuthStore((s) => s.locked);
  const unlock = useAuthStore((s) => s.unlock);
  const lockNow = useAuthStore((s) => s.lockNow);
  const promptingRef = useRef(false);

  const shouldLock = status === 'authed' && lockEnabled && locked;

  const prompt = useCallback(() => {
    if (promptingRef.current) return;
    promptingRef.current = true;
    void biometric.authenticate().then((ok) => {
      promptingRef.current = false;
      if (ok) unlock();
    });
  }, [unlock]);

  // Re-lock when the app returns to the foreground from the background.
  useEffect(() => {
    let prev = AppState.currentState;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const wasBackground = prev === 'background' || prev === 'inactive';
      prev = next;
      if (next === 'active' && wasBackground) lockNow();
    });
    return () => sub.remove();
  }, [lockNow]);

  // Auto-prompt the OS biometric dialog whenever we enter the locked state.
  useEffect(() => {
    if (shouldLock) prompt();
  }, [shouldLock, prompt]);

  if (shouldLock) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-6 bg-canvas px-8">
        <View className="gap-2">
          <Text className="text-center text-2xl font-semibold text-ink">Finby is locked</Text>
          <Text className="text-center text-base text-muted">
            Unlock with Face ID, Touch ID, or your passcode to continue.
          </Text>
        </View>
        <Button onPress={prompt}>Unlock</Button>
      </SafeAreaView>
    );
  }

  return <>{children}</>;
}
