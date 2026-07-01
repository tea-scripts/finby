import type { Ionicons } from '@expo/vector-icons';
import type { IconKey } from '@finby/shared';

type Glyph = keyof typeof Ionicons.glyphMap;

/** Semantic icon key → Ionicons glyph. */
export const CATEGORY_ICON_GLYPH: Record<IconKey, Glyph> = {
  cart: 'cart',
  utensils: 'restaurant',
  car: 'car',
  film: 'film',
  bag: 'bag-handle',
  heart: 'heart',
  bolt: 'flash',
  home: 'home',
  book: 'book',
  ellipsis: 'ellipsis-horizontal',
};
