import { useState, type ReactNode } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';

interface Option<T extends string> {
  value: T;
  label: string;
  leading?: ReactNode;
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
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          {selected?.leading ?? null}
          <Text className={`flex-1 text-base ${selected ? 'text-ink' : 'text-faint'}`} numberOfLines={1}>
            {selected ? selected.label : placeholder}
          </Text>
        </View>
        <Text className="text-faint">▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        {/* Centered, content-sized card: grows to fit the options (up to ~60% of
            the screen, then scrolls) instead of an edge-to-edge full-width sheet. */}
        <Pressable className="flex-1 items-center justify-center bg-black/50 px-6" onPress={() => setOpen(false)}>
          <Pressable className="max-h-[60%] w-full max-w-sm overflow-hidden rounded-2xl border border-line bg-surface">
            <FlatList
              data={options}
              keyExtractor={(o) => o.value}
              contentContainerClassName="py-1"
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const isSelected = item.value === value;
                return (
                  <Pressable
                    onPress={() => {
                      onSelect(item.value);
                      setOpen(false);
                    }}
                    accessibilityRole="button"
                    className="flex-row items-center justify-between px-4 py-3"
                  >
                    <View className="min-w-0 flex-1 flex-row items-center gap-2">
                      {item.leading ?? null}
                      <Text className={`flex-1 text-base ${isSelected ? 'text-accent' : 'text-ink'}`} numberOfLines={1}>
                        {item.label}
                      </Text>
                    </View>
                    {isSelected ? <Text className="text-base text-accent">✓</Text> : null}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
