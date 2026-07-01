import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { addMonths, currentMonth, formatMonthLabel, type MonthRef } from '@finby/core';
import { earliestAllowedMonthStart, type SubscriptionTier } from '@finby/shared';
import { PlanCarouselSheet } from '../billing/plan-carousel-sheet';

function monthStart(m: MonthRef): string {
  return `${m.year}-${String(m.month + 1).padStart(2, '0')}-01`;
}

export function MonthSelector({
  month,
  onChange,
  tier,
}: {
  month: MonthRef;
  onChange: (m: MonthRef) => void;
  tier: SubscriptionTier;
}) {
  const [upsell, setUpsell] = useState(false);
  const now = currentMonth();
  const prev = addMonths(month, -1);
  const floor = earliestAllowedMonthStart(tier); // null = unlimited
  const prevBlocked = floor !== null && monthStart(prev) < floor;
  const atCurrent = month.year === now.year && month.month === now.month;

  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-2xl font-bold text-ink">Dashboard</Text>
      <View className="flex-row items-center gap-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          hitSlop={8}
          onPress={() => (prevBlocked ? setUpsell(true) : onChange(prev))}
        >
          <Ionicons name="chevron-back" size={20} color={prevBlocked ? '#42506a' : '#8da3c0'} />
        </Pressable>
        <Text className="min-w-[92px] text-center text-sm font-medium text-ink">
          {formatMonthLabel(month)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          hitSlop={8}
          disabled={atCurrent}
          onPress={() => onChange(addMonths(month, 1))}
        >
          <Ionicons name="chevron-forward" size={20} color={atCurrent ? '#42506a' : '#8da3c0'} />
        </Pressable>
      </View>
      <PlanCarouselSheet open={upsell} onClose={() => setUpsell(false)} currentTier={tier} />
    </View>
  );
}
