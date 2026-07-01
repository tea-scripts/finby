import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { SubscriptionTier } from '@finby/shared';
import { TIER_NAME } from '../../lib/billing-links';
import { openWebBilling } from '../../lib/open-web-billing';
import { BottomSheet } from '../ui/bottom-sheet';
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

/** A BottomSheet holding a peek-carousel of all four plans (current marked). Any
 *  non-current CTA closes the sheet and hands off to the web (no in-app purchase). */
export function PlanCarouselSheet({
  open,
  onClose,
  currentTier,
}: {
  open: boolean;
  onClose: () => void;
  currentTier: SubscriptionTier;
}) {
  const [containerW, setContainerW] = useState(0);
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  // Modal unmounts its children when closed, so the ScrollView remounts at offset 0
  // on reopen — reset index to match, else the dots/highlight desync from the viewport.
  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  // Focused card is 84% of the container; neighbours peek via symmetric side padding.
  // Fall back to 360 before the first onLayout — this also lets the deck render under
  // RNTL, which has no layout engine so onLayout never fires with a real width.
  const w = containerW || 360;
  const cardW = Math.round(w * 0.84);
  const sidePad = Math.round((w - cardW) / 2);
  const stride = cardW + GAP;

  function goTo(i: number) {
    const clamped = Math.max(0, Math.min(TIERS.length - 1, i));
    scrollRef.current?.scrollTo({ x: clamped * stride, animated: true });
    setIndex(clamped);
  }

  function handleSelect() {
    onClose();
    openWebBilling();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Choose your plan">
      <View onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={stride}
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: sidePad, gap: GAP }}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / stride))}
        >
          {TIERS.map((tier, i) => (
            <View key={tier} style={{ width: cardW }}>
              <PlanDeckCard
                tier={tier}
                currentTier={currentTier}
                focused={i === index}
                onSelect={handleSelect}
              />
            </View>
          ))}
        </ScrollView>
        <Dots index={index} onDot={goTo} />
      </View>
    </BottomSheet>
  );
}
