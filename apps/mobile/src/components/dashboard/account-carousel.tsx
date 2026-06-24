import { useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';
import { money } from '@finby/core';
import type { AccountView } from '@finby/shared';
import { SectionLoading, SectionError, SectionEmpty, type SectionProps } from './section-card';

/** A single full-width account card. The account's color is a thin ring (border)
 *  around the card; `scale`/`opacity` animate it as the carousel pages. The card
 *  floats directly on the canvas (no surrounding section box). */
function AccountCard({
  a,
  width,
  scale,
  opacity,
}: {
  a: AccountView;
  width: number;
  scale: Animated.AnimatedInterpolation<number>;
  opacity: Animated.AnimatedInterpolation<number>;
}) {
  return (
    <View style={{ width }} className="px-1">
      <Animated.View
        style={{ transform: [{ scale }], opacity, borderWidth: 1.5, borderColor: a.color ?? '#1d6ef5' }}
        className="gap-3 rounded-2xl bg-surface-2 p-4"
      >
        <Text className="text-sm font-medium text-ink" numberOfLines={1}>
          {a.name}
        </Text>
        <Text className="text-2xl font-bold text-ink">{money(a.balance, a.currency)}</Text>
        <Text className="text-xs uppercase tracking-wide text-muted">{a.accountType}</Text>
      </Animated.View>
    </View>
  );
}

/** Page indicator — the active dot widens (mirrors the onboarding carousel). */
function Dots({ count, index, onDot }: { count: number; index: number; onDot: (i: number) => void }) {
  if (count <= 1) return null;
  return (
    <View className="mt-3 flex-row justify-center gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <Pressable key={i} testID={`account-dot-${i}`} onPress={() => onDot(i)} hitSlop={8}>
          <View className={`h-1.5 rounded-full ${i === index ? 'w-5 bg-accent' : 'w-1.5 bg-line'}`} />
        </Pressable>
      ))}
    </View>
  );
}

export function AccountCarousel({ state, onRetry }: SectionProps<AccountView[]>) {
  const accounts = state.data?.filter((a) => !a.isArchived) ?? [];
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);

  function goTo(i: number) {
    scrollRef.current?.scrollTo({ x: i * width, animated: true });
    setIndex(i);
  }

  // `width` is 0 until the container is measured; keep the interpolation input
  // range strictly increasing so the cards still render before first layout.
  const safeW = width || 1;

  return (
    <View className="gap-2">
      <Text className="text-xs font-semibold uppercase tracking-wide text-muted">Accounts</Text>
      {state.loading ? (
        <SectionLoading />
      ) : state.error || !state.data ? (
        <SectionError onRetry={onRetry} />
      ) : accounts.length === 0 ? (
        <SectionEmpty message="No accounts yet." />
      ) : (
        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          <Animated.ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
              useNativeDriver: true,
            })}
            onMomentumScrollEnd={(e) => {
              if (width) setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
            }}
          >
            {accounts.map((a, i) => {
              const inputRange = [(i - 1) * safeW, i * safeW, (i + 1) * safeW];
              const scale = scrollX.interpolate({
                inputRange,
                outputRange: [0.94, 1, 0.94],
                extrapolate: 'clamp',
              });
              const opacity = scrollX.interpolate({
                inputRange,
                outputRange: [0.5, 1, 0.5],
                extrapolate: 'clamp',
              });
              return <AccountCard key={a.id} a={a} width={width} scale={scale} opacity={opacity} />;
            })}
          </Animated.ScrollView>
          <Dots count={accounts.length} index={index} onDot={goTo} />
        </View>
      )}
    </View>
  );
}
