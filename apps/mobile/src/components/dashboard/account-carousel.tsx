import { useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { money } from '@finby/core';
import { ACCOUNT_TYPE_LABELS, type AccountType, type AccountView } from '@finby/shared';
import { CurrencyFlag } from '../ui/currency-flag';
import { SectionCard, SectionLoading, SectionError, SectionEmpty, type SectionProps } from './section-card';

const ACCENT = '#1d6ef5';

/** A valid #RRGGBB tint, or the app accent when missing/invalid. */
function tintColor(color: string | null): string {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : ACCENT;
}

/** A full-width account card tinted by the account's color: a diagonal gradient
 *  fill, a matching translucent border, the currency flag + code, and the balance.
 *  `scale`/`opacity` animate it as the carousel pages. */
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
  const tint = tintColor(a.color);
  const typeLabel = ACCOUNT_TYPE_LABELS[a.accountType as AccountType] ?? a.accountType;
  return (
    <View style={{ width }} className="px-1">
      <Animated.View
        style={{
          transform: [{ scale }],
          opacity,
          borderWidth: 1,
          // `73` ≈ 45% border, `33` ≈ 20% fill (8-digit hex alpha) — mirrors the web.
          borderColor: `${tint}73`,
          borderRadius: 16,
          overflow: 'hidden',
        }}
      >
        <LinearGradient
          colors={[`${tint}33`, 'rgba(11,22,38,0.95)']}
          locations={[0, 0.55]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ padding: 20, minHeight: 124 }}
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-medium text-muted">Balance</Text>
            <View className="flex-row items-center gap-2">
              <CurrencyFlag currency={a.currency} size={24} />
              <Text className="text-sm font-semibold text-ink">{a.currency}</Text>
            </View>
          </View>
          <Text className="mt-1 text-3xl font-bold tracking-tight text-ink">
            {money(a.balance, a.currency)}
          </Text>
          <Text className="mt-1.5 text-xs text-faint" numberOfLines={1}>
            {a.name} · {typeLabel}
          </Text>
        </LinearGradient>
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
    <SectionCard title="Accounts">
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
    </SectionCard>
  );
}
