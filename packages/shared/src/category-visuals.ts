import { DEFAULT_CATEGORIES } from './constants';

export type IconKey =
  | 'cart' | 'utensils' | 'car' | 'film' | 'bag'
  | 'heart' | 'bolt' | 'home' | 'book' | 'ellipsis';

export type CategoryVisual =
  | { kind: 'icon'; iconKey: IconKey; color: string }
  | { kind: 'emoji'; char: string; color: string };

export interface CategoryVisualInput {
  name: string;
  icon?: string | null;
  color?: string | null;
}

const ICON_KEYS = new Set<string>(DEFAULT_CATEGORIES.map((c) => c.icon));

/** Per-icon-key default color, sourced from the seed table (DRY). */
const DEFAULT_ICON_COLOR = Object.fromEntries(
  DEFAULT_CATEGORIES.map((c) => [c.icon, c.color]),
) as Record<IconKey, string>;

/** Stable palette for derived colors. */
const PALETTE = DEFAULT_CATEGORIES.map((c) => c.color);

/** Ordered keyword → emoji table; first substring match wins. */
const KEYWORD_EMOJI: ReadonlyArray<readonly [readonly string[], string]> = [
  [['salary', 'payroll', 'wage', 'paycheck', 'income'], '💼'],
  [['rent', 'mortgage', 'housing'], '🏠'],
  [['grocery', 'groceries', 'supermarket'], '🛒'],
  [['coffee', 'cafe'], '☕'],
  [['dining', 'restaurant', 'food', 'eat'], '🍽️'],
  [['transport', 'transit', 'uber', 'taxi', 'bus', 'train', 'fuel', 'gas'], '🚕'],
  [['entertainment', 'movie', 'netflix', 'game'], '🎬'],
  [['shopping', 'clothes', 'clothing'], '🛍️'],
  [['health', 'pharmacy', 'doctor', 'medical'], '🩺'],
  [['utilit', 'electric', 'water', 'internet', 'phone'], '💡'],
  [['education', 'school', 'course', 'book'], '📚'],
  [['gift', 'donation'], '🎁'],
  [['travel', 'flight', 'hotel'], '✈️'],
  [['subscription', 'membership'], '🔁'],
  [['savings', 'invest'], '📈'],
];

const FALLBACK_EMOJI = '🏷️';

/** Deterministic hash of the name → an index into PALETTE. */
function deriveColor(name: string): string {
  const key = name.trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export function resolveCategoryVisual(input: CategoryVisualInput): CategoryVisual {
  const icon = input.icon?.trim();

  // 1. Known semantic key → branded icon.
  if (icon && ICON_KEYS.has(icon)) {
    const iconKey = icon as IconKey;
    return { kind: 'icon', iconKey, color: input.color ?? DEFAULT_ICON_COLOR[iconKey] };
  }

  const color = input.color ?? deriveColor(input.name);

  // 2. Non-key icon string → stored emoji (future picker output).
  if (icon) {
    return { kind: 'emoji', char: icon, color };
  }

  // 3. Keyword-derive from the name.
  const name = input.name.toLowerCase();
  for (const [keywords, emoji] of KEYWORD_EMOJI) {
    if (keywords.some((k) => name.includes(k))) {
      return { kind: 'emoji', char: emoji, color };
    }
  }

  // 4. Generic fallback.
  return { kind: 'emoji', char: FALLBACK_EMOJI, color };
}
