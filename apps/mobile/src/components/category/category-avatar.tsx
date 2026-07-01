import { Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { resolveCategoryVisual, type CategoryVisualInput } from '@finby/shared';
import { CATEGORY_ICON_GLYPH } from './category-icon-map';
import { AVATAR_SIZE, AvatarTile, type AvatarSize } from './avatar-tile';

/** Decorative category tile: soft color-tinted background with an Ionicons glyph
 *  (known categories) or an emoji (everything else). The category name is always
 *  shown as adjacent text, so the avatar is hidden from the a11y tree. */
export function CategoryAvatar({
  category,
  size = 'sm',
}: {
  category: CategoryVisualInput;
  size?: AvatarSize;
}) {
  const visual = resolveCategoryVisual(category);
  const s = AVATAR_SIZE[size];
  return (
    <AvatarTile color={visual.color} size={size}>
      {visual.kind === 'icon' ? (
        <Ionicons name={CATEGORY_ICON_GLYPH[visual.iconKey]} size={s.icon} color={visual.color} />
      ) : (
        <Text style={{ fontSize: s.text }}>{visual.char}</Text>
      )}
    </AvatarTile>
  );
}
