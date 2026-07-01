import { Pressable, Text, View } from 'react-native';

export function StarRating({ value, onChange, size = 32 }: { value: number; onChange: (n: number) => void; size?: number }) {
  return (
    <View className="flex-row gap-1" accessibilityRole="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          onPress={() => onChange(n)}
          accessibilityRole="radio"
          accessibilityState={{ checked: n === value }}
          accessibilityLabel={`Rate ${n}`}
          hitSlop={6}
        >
          <Text style={{ fontSize: size }} className={n <= value ? 'text-warn' : 'text-line'}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}
