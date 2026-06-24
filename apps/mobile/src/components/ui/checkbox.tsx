import { Pressable, Text } from 'react-native';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  accessibilityLabel?: string;
  testID?: string;
}

/** Branded checkbox (custom, per the UI hard-rule — no native control).
 *  Unchecked: hairline border on the canvas tint. Checked: filled with the
 *  brand accent and a white check. */
export function Checkbox({ checked, onChange, accessibilityLabel, testID }: CheckboxProps) {
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      hitSlop={10}
      className={`h-6 w-6 items-center justify-center rounded-md border-2 ${
        checked ? 'border-accent bg-accent' : 'border-line bg-canvas/60'
      }`}
    >
      {checked ? <Text className="text-xs font-bold leading-none text-white">✓</Text> : null}
    </Pressable>
  );
}
