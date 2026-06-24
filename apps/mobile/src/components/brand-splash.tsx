import { Text, View } from 'react-native';

/** Branded loading screen shown while the session hydrates on launch. Works in
 *  Expo Go (the native/EAS splash only shows in a real build). */
export function BrandSplash() {
  return (
    <View className="flex-1 items-center justify-center bg-canvas">
      <Text className="text-4xl font-bold tracking-tight text-ink">
        Fin<Text className="text-accent">by</Text>
      </Text>
      <Text className="mt-2 text-sm text-muted">your money, your buddy</Text>
    </View>
  );
}
