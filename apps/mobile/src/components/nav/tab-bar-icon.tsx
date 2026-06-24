import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface TabBarIconProps {
  outline: keyof typeof Ionicons.glyphMap;
  filled: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  color: string;
}

/** Instagram-style tab icon: filled glyph on a soft accent pill when active,
 *  outline glyph otherwise. Uses explicit inline sizing (NOT NativeWind classes)
 *  so the icon never collapses inside react-navigation's tab-bar icon slot,
 *  where className-driven layout doesn't apply and the icon renders as a sliver. */
export function TabBarIcon({ outline, filled, focused, color }: TabBarIconProps) {
  return (
    <View
      testID="tab-bar-icon"
      style={{
        width: 56,
        height: 34,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 17,
        backgroundColor: focused ? 'rgba(29,110,245,0.14)' : 'transparent',
      }}
    >
      <Ionicons name={focused ? filled : outline} size={24} color={color} />
    </View>
  );
}
