import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, type PressableProps, Text, View } from 'react-native';

interface ButtonProps extends Pick<PressableProps, 'accessibilityLabel' | 'testID'> {
  variant?: 'primary' | 'ghost' | 'danger' | 'link';
  loading?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  children: ReactNode;
}

const VARIANT = {
  primary: 'bg-accent',
  ghost: 'border border-line bg-surface',
  danger: 'bg-danger',
  link: '',
} as const;

const TEXT_VARIANT = {
  primary: 'text-white',
  ghost: 'text-ink',
  danger: 'text-white',
  link: 'text-accent',
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
      className={`relative flex-row items-center justify-center gap-2 ${
        variant === 'link' ? 'px-1 py-1' : 'min-h-12 rounded-xl px-4 py-3'
      } ${VARIANT[variant]} ${isDisabled ? 'opacity-60' : ''}`}
    >
      {loading && (
        <View testID="button-spinner" className="absolute inset-0 items-center justify-center">
          <ActivityIndicator color={variant === 'ghost' || variant === 'link' ? '#e8eef7' : '#fff'} />
        </View>
      )}
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
