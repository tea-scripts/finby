// apps/mobile/src/components/streak/tier-chip.tsx
import { Text, View } from 'react-native';

const TIER_LABEL: Record<string, string> = { BRONZE: 'Bronze', SILVER: 'Silver', GOLD: 'Gold' };
const TIER_COLOR: Record<string, string> = { BRONZE: '#cd7f32', SILVER: '#c0c0c0', GOLD: '#f5a524' };

/** A small tier pill (Bronze/Silver/Gold), tier-colored. */
export function TierChip({ tier }: { tier: string }) {
  const color = TIER_COLOR[tier] ?? '#8da3c0';
  return (
    <View className="rounded-full border px-2.5 py-0.5" style={{ borderColor: color }}>
      <Text className="text-xs font-semibold" style={{ color }}>
        {TIER_LABEL[tier] ?? tier}
      </Text>
    </View>
  );
}
