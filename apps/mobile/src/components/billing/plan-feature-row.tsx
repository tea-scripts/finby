import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PlanFeature } from '@finby/shared';

/** One plan feature line: a check, the label (+ optional muted note + badge),
 *  and an optional lighter subtext beneath. */
export function PlanFeatureRow({ feature }: { feature: PlanFeature }) {
  return (
    <View className="flex-row items-start gap-2 py-1">
      <Ionicons name="checkmark-circle" size={16} color="#1fae6a" style={{ marginTop: 2 }} />
      <View className="flex-1">
        <Text className="text-sm text-ink">
          {/* own <Text> so getByText matches the label exactly, not the whole composite line */}
          <Text>{feature.label}</Text>
          {feature.note ? <Text className="text-muted"> ({feature.note})</Text> : null}
          {feature.badge ? <Text className="text-xs font-semibold text-accent"> {feature.badge}</Text> : null}
        </Text>
        {feature.subtext ? <Text className="text-xs text-muted">{feature.subtext}</Text> : null}
      </View>
    </View>
  );
}
