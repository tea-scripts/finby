import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, type PressableProps, Text, View } from 'react-native';

interface ButtonProps extends Pick<PressableProps, 'accessibilityLabel' | 'testID'> {
  variant?: 'primary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  children: ReactNode;
}

const VARIANT = {
  primary: 'bg-accent',
  ghost: 'border border-line bg-surface',
} as const;

const TEXT_VARIANT = {
  primary: 'text-white',
  ghost: 'text-ink',
} as const;

export function Button({
  variant = 'primary',
  loading = false,
  disabled = false,
  onPress,
  children,
  accessibilityLabel,
  testID,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      testID={testID}
      className={`min-h-12 flex-row items-center justify-center gap-2 rounded-xl px-4 py-3 ${VARIANT[variant]} ${isDisabled ? 'opacity-60' : ''}`}
    >
      {loading && <ActivityIndicator color={variant === 'primary' ? '#fff' : '#e8eef7'} />}
      <View className={loading ? 'opacity-0' : ''}>
        {typeof children === 'string' ? (
          <Text className={`text-base font-medium ${TEXT_VARIANT[variant]}`}>{children}</Text>
        ) : (
          children
        )}
      </View>
    </Pressable>
  );
}
