import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, type ViewStyle } from 'react-native';
import { TRACK } from '../../theme/tokens';

const BASE: ViewStyle = { backgroundColor: TRACK, borderRadius: 10 };

/** A glowing placeholder block. Pulses opacity 0.4↔1 (native driver); renders
 *  static when the user prefers reduced motion. Decorative — the section's
 *  skeleton group carries the "Loading" a11y label. Size comes from `style`. */
export function Skeleton({ style }: { style?: ViewStyle }) {
  const opacity = useRef(new Animated.Value(0.6)).current;
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let on = true;
    let loop: Animated.CompositeAnimation | undefined;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((rm) => {
        if (!on) return;
        if (rm) {
          setReduce(true);
          opacity.setValue(0.6);
          return;
        }
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
          ]),
        );
        loop.start();
      })
      .catch(() => {
        // Probe unavailable (rare) — leave the static default opacity in place.
      });
    return () => {
      on = false;
      loop?.stop();
    };
  }, [opacity]);

  return (
    <Animated.View
      testID="skeleton"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[BASE, { opacity: reduce ? 0.6 : opacity }, style]}
    />
  );
}
