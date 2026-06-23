import { forwardRef, useState } from 'react';
import { Pressable, Text, TextInput, type TextInputProps, View } from 'react-native';

interface PasswordInputProps extends TextInputProps {
  invalid?: boolean;
}

export const PasswordInput = forwardRef<TextInput, PasswordInputProps>(function PasswordInput(
  { invalid = false, ...rest },
  ref,
) {
  const [visible, setVisible] = useState(false);
  return (
    <View
      className={`min-h-12 w-full flex-row items-center rounded-xl border bg-canvas/60 px-3.5 ${invalid ? 'border-danger' : 'border-line'}`}
    >
      <TextInput
        ref={ref}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor="#5b6f8c"
        className="flex-1 py-3 text-base text-ink"
        {...rest}
      />
      <Pressable
        onPress={() => setVisible((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        hitSlop={8}
      >
        <Text className="text-xs font-medium text-accent">{visible ? 'Hide' : 'Show'}</Text>
      </Pressable>
    </View>
  );
});
