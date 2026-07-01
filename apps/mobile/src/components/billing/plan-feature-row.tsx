import { Text, View } from 'react-native';
import type { PlanFeature } from '@finby/shared';

/** One plan feature line, matching the web `FeatureRow`: a bare blue check glyph,
 *  the label (+ optional muted note + amber badge pill), and an optional lighter
 *  subtext beneath. */
export function PlanFeatureRow({ feature }: { feature: PlanFeature }) {
  return (
    <View className="flex-row items-start gap-2 py-1">
      <Text style={{ color: '#1d6ef5', marginTop: 2 }} className="text-sm">
        ✓
      </Text>
      <View className="flex-1">
        <Text className="text-sm text-ink">
          {/* own <Text> so getByText matches the label exactly, not the whole composite line */}
          <Text>{feature.label}</Text>
          {feature.note ? <Text className="italic text-muted"> ({feature.note})</Text> : null}
        </Text>
        {feature.badge ? (
          <View
            style={{ backgroundColor: 'rgba(245,165,36,0.15)' }}
            className="mt-0.5 self-start rounded-full px-1.5 py-0.5"
          >
            <Text style={{ color: '#f5a524' }} className="text-[10px] font-semibold uppercase">
              {feature.badge}
            </Text>
          </View>
        ) : null}
        {feature.subtext ? <Text className="mt-0.5 text-xs text-muted">{feature.subtext}</Text> : null}
      </View>
    </View>
  );
}
