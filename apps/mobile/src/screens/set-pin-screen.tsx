import { useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PinPad } from '../components/lock/pin-pad';
import { useAuthStore } from '../lib/use-auth-store';

const PIN_LENGTH = 4;

/** First-login PIN setup: enter a PIN, then confirm it. On a match the PIN is
 *  saved (the gate then shows the app). Shown by the AppLockGate when the lock
 *  is on but no PIN exists yet. */
export function SetPinScreen() {
  const setPin = useAuthStore((s) => s.setPin);
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [first, setFirst] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  function onChange(next: string) {
    setError(null);
    if (next.length < PIN_LENGTH) {
      setValue(next);
      return;
    }
    if (step === 'enter') {
      setFirst(next);
      setStep('confirm');
      setValue('');
    } else if (next === first) {
      void setPin(next);
    } else {
      setError('Those PINs didn’t match. Start again.');
      setFirst('');
      setStep('enter');
      setValue('');
    }
  }

  return (
    <SafeAreaView className="flex-1 items-center justify-center gap-12 bg-canvas px-6">
      <View className="items-center gap-2">
        <Text className="text-3xl font-bold tracking-tight text-ink">
          Fin<Text className="text-accent">by</Text>
        </Text>
        <Text className="text-xl font-semibold text-ink">
          {step === 'enter' ? 'Set your unlock PIN' : 'Confirm your PIN'}
        </Text>
        <Text className="text-sm text-muted">{error ?? 'You’ll use this to unlock Finby.'}</Text>
      </View>
      <PinPad length={PIN_LENGTH} value={value} onChange={onChange} />
    </SafeAreaView>
  );
}
