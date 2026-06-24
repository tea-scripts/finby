import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { TABS } from './tabs-config';
import { TabBarIcon } from './tab-bar-icon';

const CAPSULE_HEIGHT = 60;
const BOTTOM_GAP = 12;
const PILL_GAP = 6; // uniform inset of the active pill from the capsule, all sides

/** Bottom space a scrollable/anchored screen must leave so its last content
 *  clears the floating tab bar (capsule height + gap + the home-indicator inset). */
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return CAPSULE_HEIGHT + BOTTOM_GAP + Math.max(insets.bottom, 8);
}

/** A floating, frosted-glass capsule tab bar (Instagram/WhatsApp/Deel style). It
 *  sits absolutely over the screen so content scrolls underneath and shows through
 *  the blur. A SINGLE highlight pill slides (spring) between tabs as you navigate,
 *  with a uniform gap on all sides; icons only. The shadow wrapper (outside the
 *  clipped BlurView) gives the floating glow that separates it from the content. */
export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [rowWidth, setRowWidth] = useState(0);
  const count = state.routes.length;
  const cellWidth = count > 0 ? rowWidth / count : 0;
  const translateX = useRef(new Animated.Value(0)).current;
  const firstLayout = useRef(true);

  // Slide the highlight to the active tab. Snap (no animation) on the first
  // measured layout so it starts under the active tab instead of sliding in.
  useEffect(() => {
    if (cellWidth <= 0) return;
    const to = state.index * cellWidth;
    if (firstLayout.current) {
      translateX.setValue(to);
      firstLayout.current = false;
    } else {
      Animated.spring(translateX, {
        toValue: to,
        useNativeDriver: true,
        stiffness: 200,
        damping: 22,
        mass: 1,
      }).start();
    }
  }, [state.index, cellWidth, translateX]);

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(insets.bottom, 8) }}
    >
      <View
        style={{
          marginHorizontal: 24,
          borderRadius: CAPSULE_HEIGHT / 2,
          // Floating glow / depth (on the wrapper so the BlurView can still clip).
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.5,
          shadowRadius: 22,
          elevation: 16,
        }}
      >
        <BlurView
          intensity={70}
          // The iOS ultra-thin material is genuinely translucent (content shows
          // through it) — plain `dark` is near-opaque and reads as a solid panel.
          tint="systemUltraThinMaterialDark"
          style={{
            height: CAPSULE_HEIGHT,
            borderRadius: CAPSULE_HEIGHT / 2,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.14)',
          }}
        >
          <View style={{ flex: 1, flexDirection: 'row' }} onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}>
            {cellWidth > 0 ? (
              <Animated.View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: PILL_GAP,
                  bottom: PILL_GAP,
                  left: PILL_GAP,
                  width: cellWidth - PILL_GAP * 2,
                  borderRadius: (CAPSULE_HEIGHT - PILL_GAP * 2) / 2,
                  backgroundColor: 'rgba(29,110,245,0.20)',
                  transform: [{ translateX }],
                }}
              />
            ) : null}
            {state.routes.map((route, i) => {
              const tab = TABS.find((t) => t.name === route.name);
              if (!tab) return null;
              const focused = state.index === i;
              function onPress() {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }
              return (
                <Pressable
                  key={route.key}
                  testID={`tab-${tab.name}`}
                  onPress={onPress}
                  accessibilityRole="button"
                  accessibilityState={{ selected: focused }}
                  style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                >
                  <TabBarIcon
                    outline={tab.outline}
                    filled={tab.filled}
                    focused={focused}
                    color={focused ? '#1d6ef5' : '#8da3c0'}
                  />
                </Pressable>
              );
            })}
          </View>
        </BlurView>
      </View>
    </View>
  );
}
