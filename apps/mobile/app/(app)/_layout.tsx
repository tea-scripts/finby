import { Stack } from 'expo-router';
import { AppLockGate } from '../../src/components/auth/app-lock-gate';

export default function AppLayout() {
  return (
    <AppLockGate>
      <Stack screenOptions={{ headerShown: false }} />
    </AppLockGate>
  );
}
