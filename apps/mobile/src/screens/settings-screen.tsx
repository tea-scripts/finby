import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button } from '../components/ui/button';
import { Toggle } from '../components/ui/toggle';
import { useAuthStore } from '../lib/use-auth-store';

export function SettingsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const resetOnboarding = useAuthStore((s) => s.resetOnboarding);
  const lockEnabled = useAuthStore((s) => s.lockEnabled);
  const setLockEnabled = useAuthStore((s) => s.setLockEnabled);
  const currentStreak = useAuthStore((s) => s.user?.currentStreak ?? 0);

  // Dev helper: clear the onboarding flag + sign out to replay the first-launch
  // flow. Stripped from release builds.
  async function replayOnboarding() {
    await resetOnboarding();
    await logout();
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <View className="border-b border-line px-4 py-3">
        <Text className="text-lg font-semibold text-ink">Settings</Text>
      </View>

      <View className="gap-6 p-6">
        <Pressable
          onPress={() => router.push('/streaks')}
          accessibilityRole="button"
          accessibilityLabel="View your streak progress"
          className="flex-row items-center justify-between rounded-xl border border-line bg-surface px-4 py-3"
        >
          <Text className="text-base text-ink">🔥 {currentStreak}-day streak</Text>
          <Text className="text-sm font-medium text-accent">View progress →</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/subscription')}
          accessibilityRole="button"
          accessibilityLabel="Plan and billing"
          className="flex-row items-center justify-between rounded-xl border border-line bg-surface px-4 py-3"
        >
          <Text className="text-base text-ink">Plan &amp; Billing</Text>
          <Text className="text-sm font-medium text-accent">Manage →</Text>
        </Pressable>

        {user ? <Text className="text-muted">Signed in as {user.displayName}</Text> : null}

        <View className="flex-row items-center justify-between">
          <Text className="text-base text-ink">Biometric app lock</Text>
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
    </SafeAreaView>
  );
}
