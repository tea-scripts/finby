import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const [w, setW] = useState(0);
  const cell = options.length ? (w - 8) / options.length : 0; // minus the p-1 (4px) frame
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const tx = useRef(new Animated.Value(0)).current;
  const firstLayout = useRef(true);

  useEffect(() => {
    if (cell <= 0) return;
    const to = idx * cell;
    if (firstLayout.current) {
      tx.setValue(to);
      firstLayout.current = false;
    } else {
      Animated.spring(tx, { toValue: to, useNativeDriver: true, stiffness: 200, damping: 22, mass: 1 }).start();
    }
  }, [idx, cell, tx]);

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} className="flex-row rounded-xl bg-surface-2 p-1">
      {cell > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 4,
            bottom: 4,
            left: 4,
            width: cell,
            borderRadius: 8,
            backgroundColor: '#1d6ef5',
            transform: [{ translateX: tx }],
          }}
        />
      ) : null}
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={`segment-${o.value}`}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className="flex-1 items-center justify-center py-2"
          >
            <Text className={`text-sm font-medium ${active ? 'text-white' : 'text-muted'}`}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
