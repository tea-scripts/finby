import { Text, View } from 'react-native';

/** A single chat text bubble. User messages align right (accent), assistant
 *  left (surface). Empty content renders nothing (e.g. an assistant turn that
 *  only produced an action card). */
export function MessageBubble({ role, content }: { role: string; content: string }) {
  const isUser = role === 'USER';
  if (!content) return null;
  return (
    <View
      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
        isUser ? 'self-end rounded-br-md bg-accent' : 'self-start rounded-bl-md border border-line bg-surface'
      }`}
    >
      <Text className={`text-base ${isUser ? 'text-white' : 'text-ink'}`}>{content}</Text>
    </View>
  );
}
