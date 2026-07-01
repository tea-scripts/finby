import type { ReactNode } from 'react';
import { View } from 'react-native';

/** Shared avatar sizing for category/transaction tiles. */
export const AVATAR_SIZE = {
  sm: { box: 32, icon: 16, text: 15 },
  md: { box: 40, icon: 20, text: 18 },
} as const;

export type AvatarSize = keyof typeof AVATAR_SIZE;

/** A decorative rounded tile with a soft color-tinted background. Decorative for
 *  a11y — the transaction/category label is always shown as adjacent text, so the
 *  tile is hidden from the accessibility tree to avoid double-announcing. */
export function AvatarTile({
  color,
  size = 'sm',
  children,
}: {
  color: string;
  size?: AvatarSize;
  children: ReactNode;
}) {
  const s = AVATAR_SIZE[size];
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
        backgroundColor: `${color}22`,
      }}
    >
      {children}
    </View>
  );
}
