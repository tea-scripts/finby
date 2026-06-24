import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

/** Chat input row: a multiline text field + a send button. Trims and clears on
 *  send; ignores empty/whitespace input and sends nothing while disabled. */
export function Composer({ disabled, onSend }: { disabled: boolean; onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && !disabled;

  function send() {
    if (!canSend) return;
    onSend(trimmed);
    setText('');
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
        <View className="h-0 w-0 border-y-[6px] border-l-[10px] border-y-transparent border-l-white" />
      </Pressable>
    </View>
  );
}
