import { Switch } from 'react-native';

interface ToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel?: string;
}

export function Toggle({ value, onValueChange, accessibilityLabel }: ToggleProps) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      accessibilityLabel={accessibilityLabel}
      trackColor={{ false: '#1c2c46', true: '#1d6ef5' }}
      thumbColor="#e8eef7"
    />
  );
}
