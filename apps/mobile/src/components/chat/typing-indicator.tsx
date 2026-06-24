import { Text, View } from 'react-native';

/** "Assistant is typing" bubble shown while a reply is streaming. */
export function TypingIndicator() {
  return (
    <View
      testID="typing-indicator"
      className="self-start rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-3"
    >
      <Text className="text-lg leading-none text-faint">• • •</Text>
    </View>
  );
}
