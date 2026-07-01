import { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

interface SettingsRowProps {
  label: string;
  value?: string;
  onPress?: () => void;
  right?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  testID?: string;
}

export function SettingsRow({ label, value, onPress, right, danger, disabled, testID }: SettingsRowProps) {
  const showChevron = !!onPress && !right;
  return (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : onPress}
      disabled={disabled || !onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      className={`min-h-12 flex-row items-center justify-between px-4 py-3 ${disabled ? 'opacity-50' : ''}`}
    >
      <Text className={`text-base ${danger ? 'text-danger' : 'text-ink'}`}>{label}</Text>
      <View className="flex-row items-center gap-2">
        {value ? <Text className="text-sm text-muted">{value}</Text> : null}
        {right ?? (showChevron ? <Text className="text-base text-faint">›</Text> : null)}
      </View>
    </Pressable>
  );
}
