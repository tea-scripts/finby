import { Pressable, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { TABS } from './tabs-config';
import { TabBarIcon } from './tab-bar-icon';

const CAPSULE_HEIGHT = 60;
const BOTTOM_GAP = 12;

/** Bottom space a scrollable/anchored screen must leave so its last content
 *  clears the floating tab bar (capsule height + gap + the home-indicator inset). */
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return CAPSULE_HEIGHT + BOTTOM_GAP + Math.max(insets.bottom, 8);
}

/** A floating, frosted capsule tab bar (Instagram/WhatsApp/Deel style). It sits
 *  absolutely over the screen so content scrolls underneath and shows through the
 *  blur. Icons only; the active tab gets a wide accent pill filling its cell. The
 *  shadow wrapper (outside the clipped BlurView) gives it a floating glow so it
 *  reads as distinct from the content behind it. */
export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(insets.bottom, 8) }}
    >
      <View
        style={{
          marginHorizontal: 16,
          borderRadius: CAPSULE_HEIGHT / 2,
          // Floating glow / depth (lives on the wrapper so the BlurView can clip).
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.5,
          shadowRadius: 22,
          elevation: 16,
        }}
      >
        <BlurView
          intensity={60}
          tint="dark"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            height: CAPSULE_HEIGHT,
            borderRadius: CAPSULE_HEIGHT / 2,
            paddingHorizontal: 6,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.12)',
            backgroundColor: 'rgba(13,22,38,0.55)',
          }}
        >
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
                style={{ flex: 1 }}
              >
                {/* Wide active highlight that fills most of the cell (IG-style). */}
                <View
                  style={{
                    height: 44,
                    marginVertical: 8,
                    marginHorizontal: 4,
                    borderRadius: 20,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: focused ? 'rgba(29,110,245,0.20)' : 'transparent',
                  }}
                >
                  <TabBarIcon
                    outline={tab.outline}
                    filled={tab.filled}
                    focused={focused}
                    color={focused ? '#1d6ef5' : '#8da3c0'}
                  />
                </View>
              </Pressable>
            );
          })}
        </BlurView>
      </View>
    </View>
  );
}
