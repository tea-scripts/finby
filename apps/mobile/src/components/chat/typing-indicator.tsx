import { View } from 'react-native';
import LottieView from 'lottie-react-native';
import typingAnimation from '../../assets/lottie/typing.json';

/** "Assistant is thinking" bubble shown while a reply is streaming. */
export function TypingIndicator() {
  return (
    <View
      testID="typing-indicator"
      className="self-start rounded-2xl rounded-bl-md border border-line bg-surface px-3 py-1.5"
    >
      <LottieView source={typingAnimation} autoPlay loop style={{ width: 44, height: 22 }} />
    </View>
  );
}
