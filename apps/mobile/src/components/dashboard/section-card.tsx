import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { SectionState } from '@finby/core';

export type { SectionState };

/** Props every dashboard section takes: its async state + a retry for just it. */
export interface SectionProps<T> {
  state: SectionState<T>;
  onRetry: () => void;
}

export function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</Text>
      <View className="rounded-2xl border border-line bg-surface p-4">{children}</View>
    </View>
  );
}

export function SectionLoading() {
  return (
    <View testID="section-loading" className="items-center py-6">
      <ActivityIndicator color="#1d6ef5" />
    </View>
  );
}

export function SectionError({ onRetry }: { onRetry: () => void }) {
  return (
    <View className="items-start gap-2 py-1">
      <Text className="text-sm text-muted">Could not load this section.</Text>
      <Pressable testID="section-retry" onPress={onRetry} accessibilityRole="button" hitSlop={8}>
        <Text className="text-sm font-medium text-accent">Retry</Text>
      </Pressable>
    </View>
  );
}

export function SectionEmpty({ message }: { message: string }) {
  return <Text className="py-2 text-sm text-muted">{message}</Text>;
}
