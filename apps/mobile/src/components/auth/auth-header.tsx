import { Text, View } from 'react-native';

export function AuthHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View className="gap-2">
      <Text className="text-2xl font-semibold text-ink">{title}</Text>
      {subtitle ? <Text className="text-sm text-muted">{subtitle}</Text> : null}
    </View>
  );
}
