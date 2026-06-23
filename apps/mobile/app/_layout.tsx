import '../global.css';
import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { authStore, useAuthStore } from '../src/lib/use-auth-store';
import { nextRoute } from '../src/lib/auth-gate-route';

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
    const target = nextRoute({ status, onboarded, segments });
    if (target) router.replace(target);
  }, [status, onboarded, segments, router]);

  // Hold a neutral splash until hydrate resolves, so no route flashes first.
  if (status === 'loading') return <View className="flex-1 bg-canvas" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
