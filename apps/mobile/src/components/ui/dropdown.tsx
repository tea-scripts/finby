import { useState } from 'react';
import { FlatList, Modal, Pressable, Text } from 'react-native';

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
                    <Text className={`text-base ${isSelected ? 'text-accent' : 'text-ink'}`}>
                      {item.label}
                    </Text>
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
