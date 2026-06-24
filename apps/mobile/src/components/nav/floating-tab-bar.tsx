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
 *  absolutely over the screen so content scrolls underneath it; the blur lets the
 *  content show through. Icons only; the active tab gets a soft accent pill. */
export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(insets.bottom, 8) }}
    >
      <BlurView
        intensity={40}
        tint="dark"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginHorizontal: 16,
          height: CAPSULE_HEIGHT,
          borderRadius: CAPSULE_HEIGHT / 2,
          paddingHorizontal: 6,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.08)',
          backgroundColor: 'rgba(11,22,38,0.45)',
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
      </BlurView>
    </View>
  );
}
