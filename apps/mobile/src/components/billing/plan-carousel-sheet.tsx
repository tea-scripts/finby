import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import type { SubscriptionTier } from '@finby/shared';
import { TIER_NAME } from '../../lib/billing-links';
import { openWebBilling } from '../../lib/open-web-billing';
import { PlanDeckCard } from './plan-deck-card';

const TIERS: SubscriptionTier[] = ['FREE', 'PRO', 'PREMIUM', 'FAMILY'];
const GAP = 12;

/** Position dots — the active dot widens (mirrors the dashboard/onboarding carousels). */
function Dots({ index, onDot }: { index: number; onDot: (i: number) => void }) {
  return (
    <View className="mt-3 flex-row items-center justify-center gap-2">
      <Pressable
        testID="deck-prev"
        accessibilityRole="button"
        accessibilityLabel="Previous plan"
        disabled={index === 0}
        onPress={() => onDot(index - 1)}
        hitSlop={8}
        style={{ opacity: index === 0 ? 0.3 : 1 }}
      >
        <Text className="text-muted">‹</Text>
      </Pressable>
      {TIERS.map((t, i) => (
        <Pressable
          key={t}
          testID={`deck-dot-${i}`}
          accessibilityRole="button"
          accessibilityLabel={`Show ${TIER_NAME[t]} plan`}
          onPress={() => onDot(i)}
          hitSlop={8}
        >
          <View className={`h-1.5 rounded-full ${i === index ? 'w-5 bg-accent' : 'w-1.5 bg-line'}`} />
        </Pressable>
      ))}
      <Pressable
        testID="deck-next"
        accessibilityRole="button"
        accessibilityLabel="Next plan"
        disabled={index === TIERS.length - 1}
        onPress={() => onDot(index + 1)}
        hitSlop={8}
        style={{ opacity: index === TIERS.length - 1 ? 0.3 : 1 }}
      >
        <Text className="text-muted">›</Text>
      </Pressable>
    </View>
  );
}

/** A centered modal holding a peek-carousel of all four plans (current marked). Any
 *  non-current CTA closes it and hands off to the web (no in-app purchase). */
export function PlanCarouselSheet({
  open,
  onClose,
  currentTier,
}: {
  open: boolean;
  onClose: () => void;
  currentTier: SubscriptionTier;
}) {
  const currentIndex = Math.max(0, TIERS.indexOf(currentTier));

  const [containerW, setContainerW] = useState(0);
  const [index, setIndex] = useState(currentIndex);
  // Tracks the tallest laid-out card so every card can share one `minHeight` —
  // otherwise the modal resizes as shorter/taller tiers scroll into focus.
  // Note: this means one reflow on open as heights settle (each card's onLayout
  // fires as it mounts) — acceptable since it happens before any interaction.
  const [cardH, setCardH] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  // Guards the initial scroll-to-current-tier so it only fires once per open,
  // after the container width has been measured via onLayout.
  const didInitialScroll = useRef(false);

  // Modal unmounts its children when closed, so the ScrollView remounts at offset 0
  // on reopen — reset index to the current tier (mirrors the web modal opening on
  // the current plan) and re-arm the one-shot initial scroll.
  useEffect(() => {
    if (open) {
      setIndex(currentIndex);
      didInitialScroll.current = false;
    }
  }, [open, currentIndex]);

  // Focused card is 84% of the container; neighbours peek via symmetric side padding.
  // Fall back to 360 before the first onLayout — this also lets the deck render under
  // RNTL, which has no layout engine so onLayout never fires with a real width.
  const w = containerW || 360;
  const cardW = Math.round(w * 0.84);
  const sidePad = Math.round((w - cardW) / 2);
  const stride = cardW + GAP;
  // Keep the interpolation input range strictly increasing before layout settles
  // (mirrors account-carousel's `safeW`).
  const safeStride = stride || 1;

  const scrollX = useRef(new Animated.Value(currentIndex * stride)).current;

  useEffect(() => {
    if (open && containerW > 0 && !didInitialScroll.current) {
      didInitialScroll.current = true;
      scrollRef.current?.scrollTo({ x: currentIndex * stride, animated: false });
    }
  }, [open, containerW, currentIndex, stride]);

  function goTo(i: number) {
    const clamped = Math.max(0, Math.min(TIERS.length - 1, i));
    scrollRef.current?.scrollTo({ x: clamped * stride, animated: true });
    setIndex(clamped);
  }

  // Tracks the finger the instant a card reaches center, so the accent border +
  // dots update continuously during the swipe rather than waiting for momentum
  // to settle. `onMomentumScrollEnd` below still reconciles the final rest index.
  function onScrollListener(e: { nativeEvent: { contentOffset: { x: number } } }) {
    const i = Math.round(e.nativeEvent.contentOffset.x / stride);
    if (i !== index) setIndex(i);
  }

  function handleSelect() {
    onClose();
    openWebBilling();
  }

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center p-4">
        <Pressable
          testID="carousel-scrim"
          accessibilityLabel="Close"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        >
          <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={StyleSheet.absoluteFill} className="bg-black/40" />
        </Pressable>
        <View className="w-full" style={{ maxWidth: 480, width: '100%' }}>
          <View onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}>
            <Animated.ScrollView
              ref={scrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={stride}
              decelerationRate="fast"
              scrollEventThrottle={16}
              contentContainerStyle={{ paddingHorizontal: sidePad, gap: GAP }}
              onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
                useNativeDriver: true,
                listener: onScrollListener,
              })}
              onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / stride))}
            >
              {TIERS.map((tier, i) => {
                const inputRange = [(i - 1) * safeStride, i * safeStride, (i + 1) * safeStride];
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
                return (
                  <Animated.View
                    key={tier}
                    style={{ width: cardW, transform: [{ scale }], opacity }}
                    onLayout={(e) => setCardH((h) => Math.max(h, Math.round(e.nativeEvent.layout.height)))}
                  >
                    <PlanDeckCard
                      tier={tier}
                      currentTier={currentTier}
                      focused={i === index}
                      onSelect={handleSelect}
                      minHeight={cardH || undefined}
                    />
                  </Animated.View>
                );
              })}
            </Animated.ScrollView>
            <Dots index={index} onDot={goTo} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
