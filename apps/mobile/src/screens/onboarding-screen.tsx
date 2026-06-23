// apps/mobile/src/screens/onboarding-screen.tsx
import { useState } from 'react';
import { Text, View } from 'react-native';
import { ScreenContainer } from '../components/ui/screen-container';
import { Button } from '../components/ui/button';
import { useAuthStore } from '../lib/use-auth-store';

const SLIDES = [
  { title: 'Track money by chatting', body: 'Log expenses, income, and transfers just by talking to Finby — no forms, no spreadsheets.' },
  { title: 'Budgets that nudge you', body: 'Set budgets and get honest heads-ups at 75%, 90%, and 100% — before you overspend.' },
  { title: 'See where it goes', body: 'A glanceable dashboard and your full history, always one tap from the chat.' },
];

export function OnboardingScreen() {
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;
  const slide = SLIDES[index]!;

  function next() {
    if (last) void completeOnboarding();
    else setIndex((i) => i + 1);
  }

  return (
    <ScreenContainer>
      <View className="gap-3">
        <Text className="text-2xl font-semibold text-ink">{slide.title}</Text>
        <Text className="text-base text-muted">{slide.body}</Text>
      </View>

      <View className="flex-row justify-center gap-2">
        {SLIDES.map((s, i) => (
          <View key={s.title} testID={`dot-${i}`} className={`h-2 w-2 rounded-full ${i === index ? 'bg-accent' : 'bg-line'}`} />
        ))}
      </View>

      <Button onPress={next}>{last ? 'Get started' : 'Next'}</Button>
    </ScreenContainer>
  );
}
