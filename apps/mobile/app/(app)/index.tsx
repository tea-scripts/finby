import { Text, View } from 'react-native';
import { Button } from '../../src/components/ui/button';
import { Toggle } from '../../src/components/ui/toggle';
import { useAuthStore } from '../../src/lib/use-auth-store';

export default function Home() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const resetOnboarding = useAuthStore((s) => s.resetOnboarding);
  const lockEnabled = useAuthStore((s) => s.lockEnabled);
  const setLockEnabled = useAuthStore((s) => s.setLockEnabled);

  // Dev helper: clear the persisted onboarding flag and sign out so the
  // first-launch carousel replays from the top. Stripped from release builds.
  async function replayOnboarding() {
    await resetOnboarding();
    await logout();
  }

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-canvas px-6">
      <Text className="text-2xl font-semibold text-ink">Finby</Text>
      {user ? <Text className="text-muted">Signed in as {user.displayName}</Text> : null}

      {/* Biometric app-lock setting (moves to a Settings screen in a later phase). */}
      <View className="flex-row items-center gap-3">
        <Text className="text-ink">Biometric app lock</Text>
        <Toggle
          value={lockEnabled}
          onValueChange={(v) => void setLockEnabled(v)}
          accessibilityLabel="Biometric app lock"
        />
      </View>

      <Button variant="ghost" onPress={() => void logout()}>
        Log out
      </Button>
      {__DEV__ ? (
        <Button variant="ghost" onPress={() => void replayOnboarding()}>
          Replay onboarding (dev)
        </Button>
      ) : null}
    </View>
  );
}
