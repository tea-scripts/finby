import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import type { SubscriptionTier } from '@finby/shared';
import { Button } from '../ui/button';
import { PlanCarouselSheet } from '../billing/plan-carousel-sheet';

const RANK: Record<SubscriptionTier, number> = { FREE: 0, PRO: 1, PREMIUM: 2, FAMILY: 3 };

export function UpgradeGate({
  currentTier,
  requiredTier,
  children,
}: {
  currentTier: SubscriptionTier;
  requiredTier: SubscriptionTier;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (RANK[currentTier] >= RANK[requiredTier]) return <>{children}</>;
  return (
    <View className="gap-3 rounded-2xl border border-line bg-surface p-4">
      <Text className="text-base text-ink">This is a Pro feature.</Text>
      <Text className="text-sm text-muted">Upgrade to unlock multiple currencies and more.</Text>
      <Button onPress={() => setOpen(true)}>Upgrade</Button>
      <PlanCarouselSheet open={open} onClose={() => setOpen(false)} currentTier={currentTier} />
    </View>
  );
}
