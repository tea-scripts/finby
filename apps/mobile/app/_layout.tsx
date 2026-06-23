import '../global.css';
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { authStore, useAuthStore } from '../src/lib/use-auth-store';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthGate />
    </SafeAreaProvider>
  );
}

function AuthGate() {
  const router = useRouter();
  const segments = useSegments() as string[];
  const status = useAuthStore((s) => s.status);
  const onboarded = useAuthStore((s) => s.onboarded);

  // Restore a persisted session once on mount.
  useEffect(() => {
    void authStore.getState().hydrate();
  }, []);

  useEffect(() => {
    if (status === 'loading') return;
    const inAuthGroup = segments[0] === '(auth)';
    const onOnboarding = segments[1] === 'onboarding';

    if (status === 'authed') {
      if (inAuthGroup) router.replace('/(app)');
      return;
    }
    // Signed out:
    if (!onboarded) {
      if (!onOnboarding) router.replace('/(auth)/onboarding');
    } else if (!inAuthGroup) {
      router.replace('/(auth)/login');
    }
  }, [status, onboarded, segments, router]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
