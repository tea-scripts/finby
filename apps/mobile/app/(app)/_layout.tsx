import { Tabs } from 'expo-router';
import { AppLockGate } from '../../src/components/auth/app-lock-gate';
import { FloatingTabBar } from '../../src/components/nav/floating-tab-bar';
import { TABS } from '../../src/components/nav/tabs-config';
import { useNotificationResponder } from '../../src/lib/use-notification-responder';

export default function AppLayout() {
  useNotificationResponder();
  return (
    <AppLockGate>
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={(props) => <FloatingTabBar {...props} />}
      >
        {TABS.map((t) => (
          <Tabs.Screen key={t.name} name={t.name} />
        ))}
        <Tabs.Screen name="streaks" options={{ href: null }} />
      </Tabs>
    </AppLockGate>
  );
}
