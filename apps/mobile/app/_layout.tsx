import '../global.css';
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { authStore, useAuthStore } from '../src/lib/use-auth-store';
import { nextRoute } from '../src/lib/auth-gate-route';
import { BrandSplash } from '../src/components/brand-splash';

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
  // Preload the icon font. The bottom-tab bar is the first Ionicons consumer at
  // app entry, so without this it paints before the glyphs are ready and the tab
  // icons render as tofu/faint marks until a later re-render.
  const [fontsLoaded] = useFonts(Ionicons.font);

  // Restore a persisted session once on mount.
  useEffect(() => {
    void authStore.getState().hydrate();
  }, []);

  useEffect(() => {
    const target = nextRoute({ status, onboarded, segments });
    if (target) router.replace(target);
  }, [status, onboarded, segments, router]);

  // Hold a branded splash until hydrate resolves AND the icon font is ready, so
  // no route flashes first and the tab bar's first paint has real glyphs.
  if (status === 'loading' || !fontsLoaded) return <BrandSplash />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
