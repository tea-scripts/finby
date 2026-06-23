import { forwardRef } from 'react';
import { TextInput, type TextInputProps } from 'react-native';

interface InputProps extends TextInputProps {
  invalid?: boolean;
}

export const Input = forwardRef<TextInput, InputProps>(function Input({ invalid = false, ...rest }, ref) {
  return (
    <TextInput
      ref={ref}
      placeholderTextColor="#5b6f8c"
      className={`min-h-12 w-full rounded-xl border bg-canvas/60 px-3.5 py-3 text-base text-ink ${invalid ? 'border-danger' : 'border-line'}`}
      {...rest}
    />
  );
});
