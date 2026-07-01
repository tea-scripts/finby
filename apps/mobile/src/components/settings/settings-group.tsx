import { Children, type ReactNode } from 'react';
import { Text, View } from 'react-native';

export function SettingsGroup({ title, children }: { title?: string; children: ReactNode }) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View className="gap-2">
      {title ? (
        <Text className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</Text>
      ) : null}
      <View className="overflow-hidden rounded-2xl border border-line bg-surface">
        {items.map((child, i) => (
          <View key={i}>
            {i > 0 ? <View className="h-px bg-line" /> : null}
            {child}
          </View>
        ))}
      </View>
    </View>
  );
}
