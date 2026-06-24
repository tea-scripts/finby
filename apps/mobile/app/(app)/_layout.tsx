// apps/mobile/app/(app)/_layout.tsx
import { Tabs } from 'expo-router';
import { AppLockGate } from '../../src/components/auth/app-lock-gate';
import { TabBarIcon } from '../../src/components/nav/tab-bar-icon';
import { TABS } from '../../src/components/nav/tabs-config';

export default function AppLayout() {
  return (
    <AppLockGate>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarActiveTintColor: '#1d6ef5',
          tabBarInactiveTintColor: '#8da3c0',
          tabBarStyle: { backgroundColor: '#0b1626', borderTopColor: '#1c2c46' },
        }}
      >
        {TABS.map((t) => (
          <Tabs.Screen
            key={t.name}
            name={t.name}
            options={{
              tabBarIcon: ({ focused, color, size }) => (
                <TabBarIcon
                  outline={t.outline}
                  filled={t.filled}
                  focused={focused}
                  color={color}
                  size={size}
                />
              ),
            }}
          />
        ))}
      </Tabs>
    </AppLockGate>
  );
}
