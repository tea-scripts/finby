import { Ionicons } from '@expo/vector-icons';
import type { Transaction } from '@finby/shared';
import { AVATAR_SIZE, AvatarTile, type AvatarSize } from './avatar-tile';
import { CategoryAvatar } from './category-avatar';

/** Neutral slate — transfers are account↔account movement, not spend or income. */
const TRANSFER_COLOR = '#8da3c0';

/** Avatar for a transaction row. Transfers (which carry two accounts and no
 *  category) all share one neutral swap glyph; income/expense delegate to the
 *  category visual, falling back to the merchant/description name for uncategorized
 *  rows. */
export function TransactionAvatar({ tx, size = 'sm' }: { tx: Transaction; size?: AvatarSize }) {
  if (tx.type === 'TRANSFER') {
    return (
      <AvatarTile color={TRANSFER_COLOR} size={size}>
        <Ionicons name="swap-horizontal" size={AVATAR_SIZE[size].icon} color={TRANSFER_COLOR} />
      </AvatarTile>
    );
  }
  return (
    <CategoryAvatar
      category={{
        name: tx.category?.name ?? tx.merchant ?? tx.description ?? 'Transaction',
        icon: tx.category?.icon,
        color: tx.category?.color,
      }}
      size={size}
    />
  );
}
