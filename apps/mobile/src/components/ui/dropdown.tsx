import { useState } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface DropdownProps<T extends string> {
  value: T | null;
  options: Option<T>[];
  onSelect: (value: T) => void;
  placeholder?: string;
  accessibilityLabel?: string;
}

export function Dropdown<T extends string>({
  value,
  options,
  onSelect,
  placeholder = 'Select…',
  accessibilityLabel,
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        className="min-h-12 flex-row items-center justify-between rounded-xl border border-line bg-canvas/60 px-3.5 py-3"
      >
        <Text className={`text-base ${selected ? 'text-ink' : 'text-faint'}`}>
          {selected ? selected.label : placeholder}
        </Text>
        <Text className="text-faint">▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/50" onPress={() => setOpen(false)}>
          <View className="max-h-96 rounded-t-2xl border-t border-line bg-surface px-2 py-3">
            <FlatList
              data={options}
              keyExtractor={(o) => o.value}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    onSelect(item.value);
                    setOpen(false);
                  }}
                  accessibilityRole="button"
                  className="rounded-xl px-4 py-3"
                >
                  <Text className={`text-base ${item.value === value ? 'text-accent' : 'text-ink'}`}>
                    {item.label}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
