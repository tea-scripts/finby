import { Pressable, Text, View } from 'react-native';

export const ACCOUNT_COLORS = ['#1d6ef5', '#1fae6a', '#f5a524', '#ef4444', '#a78bfa', '#06b6d4'];

export function ColorPicker({ value, onChange }: { value: string | null; onChange: (c: string | null) => void }) {
  return (
    <View className="flex-row flex-wrap gap-2.5">
      <Pressable onPress={() => onChange(null)} accessibilityRole="button" accessibilityLabel="Color none"
        className={`h-8 w-8 items-center justify-center rounded-full border ${value === null ? 'border-ink' : 'border-line'} bg-surface`}>
        <Text className="text-xs text-faint">—</Text>
      </Pressable>
      {ACCOUNT_COLORS.map((c) => (
        <Pressable key={c} onPress={() => onChange(c)} accessibilityRole="button" accessibilityLabel={`Color ${c}`}
          style={{ backgroundColor: c }}
          className={`h-8 w-8 rounded-full border-2 ${value === c ? 'border-ink' : 'border-transparent'}`} />
      ))}
    </View>
  );
}
