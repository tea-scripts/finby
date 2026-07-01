import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { resolveCategoryVisual, type CategoryVisualInput } from '@finby/shared';
import { CATEGORY_ICON_GLYPH } from './category-icon-map';

const SIZES = {
  sm: { box: 32, icon: 16, text: 15 },
  md: { box: 40, icon: 20, text: 18 },
} as const;

/** Decorative category tile: soft color-tinted background with an Ionicons glyph
 *  (known categories) or an emoji (everything else). The category name is always
 *  shown as adjacent text, so the avatar is hidden from the a11y tree. */
export function CategoryAvatar({
  category,
  size = 'sm',
}: {
  category: CategoryVisualInput;
  size?: 'sm' | 'md';
}) {
  const visual = resolveCategoryVisual(category);
  const s = SIZES[size];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: s.box,
        height: s.box,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: `${visual.color}22`,
      }}
    >
      {visual.kind === 'icon' ? (
        <Ionicons name={CATEGORY_ICON_GLYPH[visual.iconKey]} size={s.icon} color={visual.color} />
      ) : (
        <Text style={{ fontSize: s.text }}>{visual.char}</Text>
      )}
    </View>
  );
}
