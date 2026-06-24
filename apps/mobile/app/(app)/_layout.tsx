import { Stack } from 'expo-router';
import { BiometricGate } from '../../src/components/auth/biometric-gate';

export default function AppLayout() {
  return (
    <BiometricGate>
      <Stack screenOptions={{ headerShown: false }} />
    </BiometricGate>
  );
}
