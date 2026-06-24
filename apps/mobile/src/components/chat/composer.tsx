import { useRef, useState } from 'react';
import { Animated, Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/** Chat input row: a multiline text field + a send button. Trims and clears on
 *  send; ignores empty/whitespace input and sends nothing while disabled. */
export function Composer({ disabled, onSend }: { disabled: boolean; onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && !disabled;

  // Quick "launch" feedback on send: the arrow lifts + shrinks, then springs back.
  const launch = useRef(new Animated.Value(0)).current;
  const sendStyle = {
    opacity: launch.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] }),
    transform: [
      { translateY: launch.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) },
      { scale: launch.interpolate({ inputRange: [0, 1], outputRange: [1, 0.8] }) },
    ],
  };

  function send() {
    if (!canSend) return;
    onSend(trimmed);
    setText('');
    launch.setValue(0);
    Animated.sequence([
      Animated.timing(launch, { toValue: 1, duration: 110, useNativeDriver: true }),
      Animated.spring(launch, { toValue: 0, friction: 5, tension: 120, useNativeDriver: true }),
    ]).start();
  }

  return (
    <View className="flex-row items-end gap-2 border-t border-line bg-canvas px-3 py-2">
      <TextInput
        testID="composer-input"
        value={text}
        onChangeText={setText}
        placeholder="Tell me what you spent…"
        placeholderTextColor="#5b6f8c"
        multiline
        className="max-h-28 min-h-11 flex-1 rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink"
        editable={!disabled}
      />
      <Pressable
        testID="composer-send"
        accessibilityRole="button"
        accessibilityLabel="Send"
        accessibilityState={{ disabled: !canSend }}
        disabled={!canSend}
        onPress={send}
        className={`h-11 w-11 items-center justify-center rounded-full ${canSend ? 'bg-accent' : 'bg-line'}`}
      >
        <Animated.View style={sendStyle}>
          <Ionicons name="arrow-up" size={22} color={canSend ? '#ffffff' : '#5b6f8c'} />
        </Animated.View>
      </Pressable>
    </View>
  );
}
