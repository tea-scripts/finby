import { Text, View } from 'react-native';
import { Button } from '../../src/components/ui/button';
import { useAuthStore } from '../../src/lib/use-auth-store';

export default function Home() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-canvas px-6">
      <Text className="text-2xl font-semibold text-ink">Finby</Text>
      {user ? <Text className="text-muted">Signed in as {user.displayName}</Text> : null}
      <Button variant="ghost" onPress={() => void logout()}>
        Log out
      </Button>
    </View>
  );
}
