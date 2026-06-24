import { useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LottieView from 'lottie-react-native';
import { Button } from '../components/ui/button';
import { useAuthStore } from '../lib/use-auth-store';
import onbChat from '../assets/lottie/onb-chat.json';
import onbBudget from '../assets/lottie/onb-budget.json';
import onbInsight from '../assets/lottie/onb-insight.json';

const SLIDES = [
  {
    title: 'Track money by chatting',
    body: 'Log expenses, income, and transfers just by talking to Finby — no forms, no spreadsheets.',
    animation: onbChat,
  },
  {
    title: 'Budgets that nudge you',
    body: 'Set budgets and get honest heads-ups at 75%, 90%, and 100% — before you overspend.',
    animation: onbBudget,
  },
  {
    title: 'See where it goes',
    body: 'A glanceable dashboard and your full history, always one tap from the chat.',
    animation: onbInsight,
  },
];

export function OnboardingScreen() {
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding);
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;

  function goTo(i: number) {
    const clamped = Math.max(0, Math.min(SLIDES.length - 1, i));
    scrollRef.current?.scrollTo?.({ x: clamped * width, animated: true });
    setIndex(clamped);
  }

  function onMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!width) return;
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  }

  function onNext() {
    if (last) void completeOnboarding();
    else goTo(index + 1);
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        scrollEventThrottle={16}
      >
        {SLIDES.map((slide) => (
          <View key={slide.title} style={{ width }} className="flex-1 items-center justify-center px-8">
            <LottieView
              source={slide.animation}
              autoPlay
              loop
              style={{ width: width * 0.66, height: width * 0.66 }}
            />
            <Text className="mt-8 text-center text-2xl font-semibold text-ink">{slide.title}</Text>
            <Text className="mt-3 text-center text-base leading-relaxed text-muted">{slide.body}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Page indicator — active dot widens. Tappable to jump. */}
      <View className="flex-row justify-center gap-2 py-5">
        {SLIDES.map((slide, i) => (
          <Pressable key={slide.title} testID={`dot-${i}`} onPress={() => goTo(i)} hitSlop={8}>
            <View className={`h-2 rounded-full ${i === index ? 'w-6 bg-accent' : 'w-2 bg-line'}`} />
          </Pressable>
        ))}
      </View>

      {/* Controls — the primary button stays full-width and fixed on every slide;
          Back lives in a fixed-height slot below so neither the button nor the
          dots shift position between slides (swipe works either way too). */}
      <View className="px-6 pb-4">
        <Button onPress={onNext}>{last ? 'Get started' : 'Next'}</Button>
        <View className="mt-2 h-10 items-center justify-center">
          {index > 0 ? (
            <Pressable onPress={() => goTo(index - 1)} hitSlop={8} accessibilityRole="button">
              <Text className="text-sm font-medium text-accent">Back</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}
