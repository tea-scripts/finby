import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PinPad } from '../components/lock/pin-pad';
import { Wordmark } from '../components/ui/wordmark';
import { useAuthStore } from '../lib/use-auth-store';
import { biometric } from '../lib/runtime.native';

const PIN_LENGTH = 4;

/** The locked-app screen: PIN entry with biometric as the fast path. Auto-prompts
 *  biometric on mount; a wrong PIN shakes + clears. "Switch account" signs out. */
export function UnlockScreen() {
  const user = useAuthStore((s) => s.user);
  const verifyPin = useAuthStore((s) => s.verifyPin);
  const unlock = useAuthStore((s) => s.unlock);
  const logout = useAuthStore((s) => s.logout);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const promptingRef = useRef(false);
  const shake = useRef(new Animated.Value(0)).current;

  const promptBiometric = useCallback(() => {
    if (promptingRef.current) return;
    promptingRef.current = true;
    void biometric.authenticate().then((ok) => {
      promptingRef.current = false;
      if (ok) unlock();
    });
  }, [unlock]);

  // Auto-prompt biometric when the lock screen appears.
  useEffect(() => {
    promptBiometric();
  }, [promptBiometric]);

  function runShake() {
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 55, useNativeDriver: true }),
    ]).start();
  }

  async function onChange(next: string) {
    setError(null);
    setValue(next);
    if (next.length < PIN_LENGTH) return;
    if (await verifyPin(next)) {
      unlock();
    } else {
      setError('Wrong PIN. Try again.');
      runShake();
      setValue('');
    }
  }

  const translateX = shake.interpolate({ inputRange: [-1, 1], outputRange: [-10, 10] });

  return (
    <SafeAreaView className="flex-1 items-center justify-between bg-canvas px-6 py-12">
      <View className="items-center gap-2 pt-6">
        <Wordmark height={34} style={{ marginBottom: 8 }} />
        <Text className="text-xl font-semibold text-ink">
          Welcome back{user ? `, ${user.displayName}` : ''}
        </Text>
        <Animated.Text style={{ transform: [{ translateX }] }} className="text-sm text-muted">
          {error ?? 'Enter your PIN to unlock'}
        </Animated.Text>
      </View>

      <PinPad
        length={PIN_LENGTH}
        value={value}
        onChange={onChange}
        bottomLeft={
          <Pressable
            testID="unlock-biometric"
            onPress={promptBiometric}
            accessibilityRole="button"
            accessibilityLabel="Unlock with Face ID"
            className="h-[72px] w-[72px] items-center justify-center"
          >
            <Ionicons name="scan-outline" size={30} color="#1d6ef5" />
          </Pressable>
        }
      />

      <Pressable testID="unlock-switch" onPress={() => void logout()} accessibilityRole="button">
        <Text className="text-sm text-muted">
          Not you? <Text className="font-medium text-accent">Switch account</Text>
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}
