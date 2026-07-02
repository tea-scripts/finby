import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { AppLockGate } from '../../src/components/auth/app-lock-gate';
import { FloatingTabBar } from '../../src/components/nav/floating-tab-bar';
import { TABS } from '../../src/components/nav/tabs-config';
import { useNotificationResponder } from '../../src/lib/use-notification-responder';
import { useAuthStore } from '../../src/lib/use-auth-store';

export default function AppLayout() {
  useNotificationResponder();
  // Remount the whole tab subtree when the active workspace changes, so every
  // screen re-fetches for the new workspace (some use once-guards). Keyed on the
  // id (not the object) so currency-preference merges don't remount.
  const workspaceId = useAuthStore((s) => s.workspace?.id);
  return (
    <AppLockGate>
      <View key={workspaceId ?? 'none'} style={{ flex: 1 }}>
        <Tabs
          screenOptions={{ headerShown: false }}
          tabBar={(props) => <FloatingTabBar {...props} />}
        >
          {TABS.map((t) => (
            <Tabs.Screen key={t.name} name={t.name} />
          ))}
          <Tabs.Screen name="streaks" options={{ href: null }} />
        </Tabs>
      </View>
    </AppLockGate>
  );
}
