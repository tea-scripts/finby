import { type ReactNode } from 'react';
import { Text, View } from 'react-native';

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export function Field({ label, error, hint, children }: FieldProps) {
  return (
    <View className="gap-1.5">
      <Text className="text-xs font-medium uppercase tracking-wide text-muted">{label}</Text>
      {children}
      {error ? (
        <Text className="text-xs text-danger">{error}</Text>
      ) : hint ? (
        <Text className="text-xs text-faint">{hint}</Text>
      ) : null}
    </View>
  );
}
