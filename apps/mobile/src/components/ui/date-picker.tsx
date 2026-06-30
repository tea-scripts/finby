import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BottomSheet } from './bottom-sheet';
import { MONTHS_LONG, WEEKDAYS, daysInMonth, firstWeekday, parseISO, toISO } from '../../lib/calendar';

function label(value: string): string {
  const p = parseISO(value);
  return p ? `${MONTHS_LONG[p.m - 1]?.slice(0, 3)} ${p.d}, ${p.y}` : '';
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Select date…',
  accessibilityLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  accessibilityLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseISO(value);
  const [view, setView] = useState(() =>
    selected
      ? { y: selected.y, m: selected.m }
      : { y: new Date().getFullYear(), m: new Date().getMonth() + 1 },
  );

  // Re-sync the shown month to the selected date each time the sheet opens.
  useEffect(() => {
    if (open && selected) setView({ y: selected.y, m: selected.m });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function shiftMonth(delta: number) {
    setView((v) => {
      const zero = v.m - 1 + delta;
      const y = v.y + Math.floor(zero / 12);
      const m = ((zero % 12) + 12) % 12 + 1;
      return { y, m };
    });
  }

  const total = daysInMonth(view.y, view.m);
  const lead = firstWeekday(view.y, view.m);
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];

  function choose(day: number) {
    onChange(toISO(view.y, view.m, day));
    setOpen(false);
  }

  const isSel = (day: number): boolean =>
    selected != null && selected.y === view.y && selected.m === view.m && selected.d === day;

  return (
    <>
      <Pressable
        testID="date-trigger"
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={() => setOpen(true)}
        className="min-h-12 flex-row items-center justify-between rounded-xl border border-line bg-canvas/60 px-3.5 py-3"
      >
        <Text className={`text-base ${selected ? 'text-ink' : 'text-faint'}`}>
          {selected ? label(value) : placeholder}
        </Text>
        <Text className="text-faint">▦</Text>
      </Pressable>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Choose date">
        <View className="mb-2 flex-row items-center justify-between">
          <Pressable testID="month-prev" onPress={() => shiftMonth(-1)} hitSlop={8} className="px-3 py-1">
            <Text className="text-xl text-muted">‹</Text>
          </Pressable>
          <Text className="text-base font-medium text-ink">
            {MONTHS_LONG[view.m - 1]} {view.y}
          </Text>
          <Pressable testID="month-next" onPress={() => shiftMonth(1)} hitSlop={8} className="px-3 py-1">
            <Text className="text-xl text-muted">›</Text>
          </Pressable>
        </View>
        <View className="flex-row flex-wrap">
          {WEEKDAYS.map((wd) => (
            <Text key={wd} className="w-[14.28%] py-1 text-center text-xs text-faint">
              {wd}
            </Text>
          ))}
          {cells.map((day, i) =>
            day === null ? (
              <View key={`pad-${i}`} className="w-[14.28%] py-1.5" />
            ) : (
              <Pressable
                key={day}
                testID={`day-${day}`}
                onPress={() => choose(day)}
                className="w-[14.28%] items-center py-1.5"
              >
                <View className={`h-9 w-9 items-center justify-center rounded-full ${isSel(day) ? 'bg-accent' : ''}`}>
                  <Text className={`text-sm ${isSel(day) ? 'font-semibold text-white' : 'text-ink'}`}>{day}</Text>
                </View>
              </Pressable>
            ),
          )}
        </View>
      </BottomSheet>
    </>
  );
}
