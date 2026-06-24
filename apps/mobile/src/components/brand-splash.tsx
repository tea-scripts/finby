import { Text, View } from 'react-native';
import { Wordmark } from './ui/wordmark';

/** Branded loading screen shown while the session hydrates on launch. Works in
 *  Expo Go (the native/EAS splash only shows in a real build). */
export function BrandSplash() {
  return (
    <View className="flex-1 items-center justify-center bg-canvas">
      <Wordmark height={40} />
      <Text className="mt-3 text-sm text-muted">your money, your buddy</Text>
    </View>
  );
}
