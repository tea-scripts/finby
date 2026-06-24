import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface TabBarIconProps {
  outline: keyof typeof Ionicons.glyphMap;
  filled: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  color: string;
}

/** A single tab glyph: filled when active, outline otherwise. The active
 *  highlight pill is drawn by the FloatingTabBar cell around this icon, so this
 *  stays icon-only with explicit sizing (it renders inside react-navigation's
 *  tab slot, where className-driven layout collapses). */
export function TabBarIcon({ outline, filled, focused, color }: TabBarIconProps) {
  return (
    <View testID="tab-bar-icon" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={focused ? filled : outline} size={24} color={color} />
    </View>
  );
}
