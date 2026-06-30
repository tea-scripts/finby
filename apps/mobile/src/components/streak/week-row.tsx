// apps/mobile/src/components/streak/week-row.tsx
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { isoWeekDays } from '@finby/shared';

const LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** A Mon–Sun strip showing which days of the current week were logged. `today`
 *  is the user's local today (YYYY-MM-DD) — the calendar's `to` — so no tz math. */
export function WeekRow({
  activeDays,
  repairedDays,
  today,
}: {
  activeDays: string[];
  repairedDays: string[];
  today: string;
}) {
  const active = new Set([...activeDays, ...repairedDays]);
  const days = isoWeekDays(today);

  return (
    <View className="w-full flex-row justify-between" accessibilityRole="list">
      {days.map((date, i) => {
        const isActive = active.has(date);
        const isToday = date === today;
        const isFuture = date > today;
        const dayNum = Number(date.slice(8, 10));
        const circle = isActive ? 'bg-warn' : isToday ? 'border-2 border-warn' : 'border border-line';
        return (
          <View key={date} className="items-center gap-1" accessibilityRole="text">
            <Text className="text-xs text-muted">{LABELS[i]}</Text>
            <View className={`h-8 w-8 items-center justify-center rounded-full ${circle}`}>
              {isActive ? (
                <Ionicons name="checkmark" size={16} color="#ffffff" />
              ) : isFuture ? (
                <Text className="text-xs text-faint">{dayNum}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
