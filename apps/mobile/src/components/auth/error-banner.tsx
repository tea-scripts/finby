import { Text, View } from 'react-native';

export function ErrorBanner({ message }: { message: string }) {
  return (
    <View className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5">
      <Text className="text-sm text-danger">{message}</Text>
    </View>
  );
}
