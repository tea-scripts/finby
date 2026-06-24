import { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface PinPadProps {
  length: number;
  value: string;
  onChange: (next: string) => void;
  /** Optional control in the bottom-left numpad slot (e.g. a biometric button). */
  bottomLeft?: ReactNode;
}

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];

/** Numeric PIN entry: a row of dots reflecting the entered length + a numpad.
 *  Stateless — the parent owns `value` and reacts when it reaches `length`. */
export function PinPad({ length, value, onChange, bottomLeft }: PinPadProps) {
  function press(digit: string) {
    if (value.length >= length) return;
    onChange(value + digit);
  }

  return (
    <View className="items-center gap-9">
      <View className="flex-row gap-4">
        {Array.from({ length }).map((_, i) => (
          <View
            key={i}
            testID={`pin-dot-${i}`}
            className={`h-4 w-4 rounded-full border-2 ${
              i < value.length ? 'border-accent bg-accent' : 'border-line'
            }`}
          />
        ))}
      </View>

      <View className="gap-5">
        {ROWS.map((row, ri) => (
          <View key={ri} className="flex-row gap-6">
            {row.map((digit) => (
              <Pressable
                key={digit}
                testID={`pin-key-${digit}`}
                onPress={() => press(digit)}
                accessibilityRole="button"
                className="h-[72px] w-[72px] items-center justify-center rounded-full bg-surface active:bg-surface/60"
              >
                <Text className="text-3xl text-ink">{digit}</Text>
              </Pressable>
            ))}
          </View>
        ))}

        <View className="flex-row gap-6">
          <View className="h-[72px] w-[72px] items-center justify-center">{bottomLeft}</View>
          <Pressable
            testID="pin-key-0"
            onPress={() => press('0')}
            accessibilityRole="button"
            className="h-[72px] w-[72px] items-center justify-center rounded-full bg-surface active:bg-surface/60"
          >
            <Text className="text-3xl text-ink">0</Text>
          </Pressable>
          <Pressable
            testID="pin-key-back"
            onPress={() => onChange(value.slice(0, -1))}
            accessibilityRole="button"
            accessibilityLabel="Delete"
            className="h-[72px] w-[72px] items-center justify-center"
          >
            <Ionicons name="backspace-outline" size={28} color="#8da3c0" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
