import { Text, View } from 'react-native';
import { money } from '@finby/core';
import type { ChatAction } from '@finby/shared';

/** A committed chat action: a logged transaction or a set budget. */
export function ActionCard({ action }: { action: ChatAction }) {
  if (action.type === 'BUDGET_SET') {
    return (
      <View className="self-start rounded-xl border border-line bg-surface/60 px-3 py-2">
        <Text className="text-xs text-muted">
          Budget set{action.preview.category ? ` for ${action.preview.category}` : ''}.
        </Text>
      </View>
    );
  }

  const { preview } = action;
  return (
    <View className="max-w-[85%] self-start rounded-xl border border-line bg-surface px-3.5 py-3">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-[11px] font-medium uppercase tracking-wide text-success">✓ Logged</Text>
        <Text className="text-base font-semibold text-ink">{money(preview.amount, preview.currency)}</Text>
      </View>
      {preview.merchant || preview.category ? (
        <View className="mt-2.5 flex-row flex-wrap gap-1.5">
          {preview.merchant ? (
            <Text className="rounded-md border border-line bg-canvas/60 px-2 py-0.5 text-xs text-muted">
              {preview.merchant}
            </Text>
          ) : null}
          {preview.category ? (
            <Text className="rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs text-accent">
              {preview.category}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
