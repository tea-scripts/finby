import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface TabBarIconProps {
  outline: keyof typeof Ionicons.glyphMap;
  filled: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  color: string;
  size: number;
}

/** Instagram-style tab icon: filled glyph on a soft accent pill when active,
 *  outline glyph otherwise. `color`/`size` come from expo-router's Tabs. */
export function TabBarIcon({ outline, filled, focused, color, size }: TabBarIconProps) {
  return (
    <View
      testID="tab-bar-icon"
      className={`items-center justify-center rounded-2xl px-4 py-1 ${focused ? 'bg-accent-soft' : ''}`}
    >
      <Ionicons name={focused ? filled : outline} size={size} color={color} />
    </View>
  );
}
