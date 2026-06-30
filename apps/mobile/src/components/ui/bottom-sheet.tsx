import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** A bottom-anchored sheet: a tap-to-close scrim with a panel that rises in
 *  (RN Animated; Reanimated is off in Expo Go). Built on the core Modal. */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const rise = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    if (!open) return;
    rise.setValue(24);
    Animated.timing(rise, { toValue: 0, duration: 200, useNativeDriver: true }).start();
  }, [open, rise]);

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable
          testID="sheet-scrim"
          accessibilityLabel="Close"
          onPress={onClose}
          className="absolute inset-0 bg-black/60"
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Animated.View
            style={{ transform: [{ translateY: rise }], paddingBottom: insets.bottom + 16 }}
            className="rounded-t-3xl border-t border-line bg-surface px-5 pt-3"
          >
            <View className="mb-3 h-1 w-10 self-center rounded-full bg-line" />
            {title ? <Text className="mb-3 text-lg font-semibold text-ink">{title}</Text> : null}
            {children}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
