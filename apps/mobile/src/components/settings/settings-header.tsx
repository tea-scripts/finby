import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

export function SettingsHeader({ title }: { title: string }) {
  const router = useRouter();
  return (
    <View className="flex-row items-center gap-2 border-b border-line px-2 py-3">
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}
        className="px-2 py-1"
      >
        <Text className="text-2xl text-ink">‹</Text>
      </Pressable>
      <Text className="text-lg font-semibold text-ink">{title}</Text>
    </View>
  );
}
