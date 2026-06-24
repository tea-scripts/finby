# Mobile Phase 5c — Transactions List & Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Transactions tab placeholder with a native, day-grouped, infinitely-scrolling transactions list with filters and a slide-up edit sheet, backed by the already-bound `api.transactions`.

**Architecture:** Build pure logic first (date math, grouping, presets), then three reusable on-brand primitives (BottomSheet, SegmentedControl, DatePicker — no native controls), then the feature components (row, filters sheet, edit sheet), then the screen that composes them (SectionList + infinite scroll + pull-to-refresh + staggered entry animation), and finally swap the route. All motion uses RN core `Animated` (Reanimated is off in Expo Go).

**Tech Stack:** Expo SDK 54, expo-router, NativeWind, RN `Animated` + core `Modal`, jest-expo + @testing-library/react-native (`*.test.tsx`), Vitest (`*.test.ts`). Data/format from `@finby/core` (`money`, `shortDate`, `dayLabel`, `dayKey`, `currentMonthRange`); types/constants from `@finby/shared` (`Transaction`, `TransactionQuery`, `TransactionPatch`, `Category`, `CURRENCY_CODES`).

## Global Constraints

- **Branch:** `feat/mobile-phase5c-transactions` (already checked out; holds the spec).
- **No new dependencies.** No Reanimated/gesture-handler; RN `Animated` only (worklets are disabled in Expo Go). No native date/sheet controls — custom, on-brand.
- **Color tokens** (`src/theme/tokens.ts`): canvas `#06101f`, surface `#0b1626`, surface-2 `#11203a`, line `#1c2c46`, accent `#1d6ef5`, ink `#e8eef7`, muted `#8da3c0`, faint `#5b6f8c`, success `#1fae6a`, warn `#f5a524`, danger `#ef4444`. RN color props take hex literals.
- **Mono font** for amounts: `Platform.select({ ios: 'Menlo', default: 'monospace' })`.
- **Reused primitives** (`src/components/ui/`): `Dropdown` (`value: T|null`, `options: {value,label}[]`, `onSelect: (v)=>void`, `placeholder`, `accessibilityLabel`), `Input` (RN `TextInput` props + `invalid?`), `Field` (`label`, `error?`, `hint?`, `children`), `Button` (`onPress`, `loading?`, `variant?`, `children`), `CurrencyFlag`.
- **jest-expo conventions** (from `mobile-app-architecture` memory): mock the store via a `mock`-prefixed shared object; mock `runtime.native` `api` with mock fns created INSIDE the factory, retrieved via `import { api }`; mock `react-native-safe-area-context`; `await` EVERY `fireEvent`; no JSX/component factories in `jest.mock`.
- **Commit style (HARD):** NO AI-attribution trailers / "Generated with" / "Co-Authored-By". Atomic commits; use the exact message in each task.
- **Route wrappers** under `app/(app)/` are one-line re-exports; NO test files under `app/`.
- All commands run from `apps/mobile/` unless noted. Single jest file: `npx jest <path>`; single vitest file: `npx vitest run <path>`.

---

### Task 1: Calendar date helpers (pure)

**Files:**
- Create: `apps/mobile/src/lib/calendar.ts`
- Test: `apps/mobile/src/lib/calendar.test.ts`

**Interfaces:**
- Produces: `parseISO(v: string): {y:number;m:number;d:number} | null`, `toISO(y,m,d): string`, `daysInMonth(y,m): number`, `firstWeekday(y,m): number` (0=Sun, m is 1-12), `MONTHS_LONG: string[]`, `WEEKDAYS: string[]`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/src/lib/calendar.test.ts
import { describe, expect, it } from 'vitest';
import { parseISO, toISO, daysInMonth, firstWeekday } from './calendar';

describe('calendar', () => {
  it('parses and re-emits ISO without timezone drift', () => {
    expect(parseISO('2026-06-07')).toEqual({ y: 2026, m: 6, d: 7 });
    expect(parseISO('nope')).toBeNull();
    expect(toISO(2026, 6, 7)).toBe('2026-06-07');
    expect(toISO(2026, 12, 1)).toBe('2026-12-01');
  });

  it('counts days including a leap February', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 6)).toBe(30);
  });

  it('finds the weekday of the 1st (0=Sun)', () => {
    // 2026-06-01 is a Monday.
    expect(firstWeekday(2026, 6)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/calendar.test.ts`
Expected: FAIL — cannot find module `./calendar`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/mobile/src/lib/calendar.ts
/** Timezone-safe calendar math for the custom DatePicker. Never parse a date
 *  string through `new Date(str)` — that shifts by the local timezone. */
export const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export interface YMD {
  y: number;
  m: number; // 1-12
  d: number;
}

const pad = (n: number): string => String(n).padStart(2, '0');

export function parseISO(value: string): YMD | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

export function toISO(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

/** Weekday index (0=Sun) of the 1st of the month. */
export function firstWeekday(y: number, m: number): number {
  return new Date(y, m - 1, 1).getDay();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/calendar.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/calendar.ts apps/mobile/src/lib/calendar.test.ts
git commit -m "feat(mobile): timezone-safe calendar helpers for the date picker"
```

---

### Task 2: Transactions view logic (pure)

**Files:**
- Create: `apps/mobile/src/lib/transactions-view.ts`
- Test: `apps/mobile/src/lib/transactions-view.test.ts`

**Interfaces:**
- Consumes: `dayKey`, `dayLabel`, `currentMonthRange` from `@finby/core`; `Transaction`, `TransactionQuery` from `@finby/shared`.
- Produces:
  - `type DaySection = { key: string; title: string; data: Transaction[] }`
  - `groupByDay(txs: Transaction[]): DaySection[]`
  - `type DatePreset = 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_90' | 'ALL' | 'CUSTOM'`
  - `DATE_PRESET_OPTIONS: { value: DatePreset; label: string }[]`
  - `presetRange(preset: DatePreset, now: Date): { fromDate?: string; toDate?: string }`
  - `activeFilterCount(q: TransactionQuery): number`

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/src/lib/transactions-view.test.ts
import { describe, expect, it } from 'vitest';
import { groupByDay, presetRange, activeFilterCount } from './transactions-view';
import type { Transaction } from '@finby/shared';

function tx(id: string, date: string): Transaction {
  return {
    id, type: 'EXPENSE', status: 'CONFIRMED', amountOriginal: '1.00', currencyOriginal: 'USD',
    amountBase: '1.00', currencyBase: 'USD', fxRateUsed: '1', merchant: id, description: null,
    category: null, account: null, transactionDate: date, tags: [], aiConfidence: null,
    loggedByUserId: 'u1', createdAt: date,
  };
}

describe('groupByDay', () => {
  it('groups consecutive same-day items, preserving order', () => {
    const sections = groupByDay([
      tx('a', '2026-06-20T10:00:00.000Z'),
      tx('b', '2026-06-20T08:00:00.000Z'),
      tx('c', '2026-06-19T08:00:00.000Z'),
    ]);
    expect(sections).toHaveLength(2);
    expect(sections[0].data.map((t) => t.id)).toEqual(['a', 'b']);
    expect(sections[1].data.map((t) => t.id)).toEqual(['c']);
  });
});

describe('presetRange', () => {
  const now = new Date('2026-06-25T12:00:00.000Z');
  it('LAST_90 spans 90 days back to today', () => {
    expect(presetRange('LAST_90', now)).toEqual({ fromDate: '2026-03-27', toDate: '2026-06-25' });
  });
  it('ALL clears the range', () => {
    expect(presetRange('ALL', now)).toEqual({});
  });
  it('LAST_MONTH spans the previous calendar month', () => {
    expect(presetRange('LAST_MONTH', now)).toEqual({ fromDate: '2026-05-01', toDate: '2026-05-31' });
  });
});

describe('activeFilterCount', () => {
  it('counts category, currency and date filters (not type)', () => {
    expect(activeFilterCount({ type: 'EXPENSE' })).toBe(0);
    expect(activeFilterCount({ categoryId: 'c1', currency: 'USD' })).toBe(2);
    expect(activeFilterCount({ fromDate: '2026-06-01', toDate: '2026-06-30' })).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/transactions-view.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/mobile/src/lib/transactions-view.ts
import { dayKey, dayLabel, currentMonthRange } from '@finby/core';
import type { Transaction, TransactionQuery } from '@finby/shared';

export interface DaySection {
  key: string;
  title: string;
  data: Transaction[];
}

/** Group an already-sorted (newest-first) list into consecutive same-day
 *  sections, titled "Today" / "Yesterday" / "Thu, Jun 5, 2026". */
export function groupByDay(txs: Transaction[]): DaySection[] {
  const sections: DaySection[] = [];
  for (const t of txs) {
    const key = dayKey(t.transactionDate);
    const last = sections[sections.length - 1];
    if (last && last.key === key) {
      last.data.push(t);
    } else {
      sections.push({ key, title: dayLabel(t.transactionDate), data: [t] });
    }
  }
  return sections;
}

export type DatePreset = 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_90' | 'ALL' | 'CUSTOM';

export const DATE_PRESET_OPTIONS: { value: DatePreset; label: string }[] = [
  { value: 'THIS_MONTH', label: 'This month' },
  { value: 'LAST_MONTH', label: 'Last month' },
  { value: 'LAST_90', label: 'Last 90 days' },
  { value: 'ALL', label: 'All time' },
  { value: 'CUSTOM', label: 'Custom' },
];

const iso = (d: Date): string => d.toISOString().slice(0, 10);

export function presetRange(preset: DatePreset, now: Date): { fromDate?: string; toDate?: string } {
  if (preset === 'ALL' || preset === 'CUSTOM') return {};
  if (preset === 'THIS_MONTH') return currentMonthRange();
  if (preset === 'LAST_90') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 90));
    return { fromDate: iso(from), toDate: iso(now) };
  }
  // LAST_MONTH: the previous calendar month, 1st -> last day.
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return { fromDate: iso(from), toDate: iso(to) };
}

/** Active non-type filters, for the filter button's badge (date counts as one). */
export function activeFilterCount(q: TransactionQuery): number {
  let n = 0;
  if (q.categoryId) n += 1;
  if (q.currency) n += 1;
  if (q.fromDate || q.toDate) n += 1;
  return n;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/transactions-view.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/transactions-view.ts apps/mobile/src/lib/transactions-view.test.ts
git commit -m "feat(mobile): transactions view logic (day grouping, date presets, filter count)"
```

---

### Task 3: BottomSheet primitive

**Files:**
- Create: `apps/mobile/src/components/ui/bottom-sheet.tsx`
- Test: `apps/mobile/src/components/ui/bottom-sheet.test.tsx`

**Interfaces:**
- Produces: `BottomSheet({ open, onClose, title?, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode })` — a bottom-anchored slide-up panel over a tap-to-close scrim.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/ui/bottom-sheet.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { BottomSheet } from './bottom-sheet';

describe('BottomSheet', () => {
  it('renders title and children when open', async () => {
    await render(
      <BottomSheet open onClose={jest.fn()} title="Filters">
        <Text>BODY</Text>
      </BottomSheet>,
    );
    expect(screen.getByText('Filters')).toBeTruthy();
    expect(screen.getByText('BODY')).toBeTruthy();
  });

  it('closes when the scrim is tapped', async () => {
    const onClose = jest.fn();
    await render(
      <BottomSheet open onClose={onClose}>
        <Text>BODY</Text>
      </BottomSheet>,
    );
    fireEvent.press(screen.getByTestId('sheet-scrim'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/ui/bottom-sheet.test.tsx`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/mobile/src/components/ui/bottom-sheet.tsx
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** A bottom-anchored sheet: a tap-to-close scrim with a panel that rises in
 *  (RN Animated; Reanimated is off in Expo Go). Built on the core Modal. */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const rise = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    if (!open) return;
    rise.setValue(24);
    Animated.timing(rise, { toValue: 0, duration: 200, useNativeDriver: true }).start();
  }, [open, rise]);

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable
          testID="sheet-scrim"
          accessibilityLabel="Close"
          onPress={onClose}
          className="absolute inset-0 bg-black/60"
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Animated.View
            style={{ transform: [{ translateY: rise }], paddingBottom: insets.bottom + 16 }}
            className="rounded-t-3xl border-t border-line bg-surface px-5 pt-3"
          >
            <View className="mb-3 h-1 w-10 self-center rounded-full bg-line" />
            {title ? <Text className="mb-3 text-lg font-semibold text-ink">{title}</Text> : null}
            {children}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/ui/bottom-sheet.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/ui/bottom-sheet.tsx apps/mobile/src/components/ui/bottom-sheet.test.tsx
git commit -m "feat(mobile): BottomSheet primitive (slide-up panel + scrim)"
```

---

### Task 4: SegmentedControl primitive

**Files:**
- Create: `apps/mobile/src/components/ui/segmented-control.tsx`
- Test: `apps/mobile/src/components/ui/segmented-control.test.tsx`

**Interfaces:**
- Produces: `SegmentedControl<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void })` — a pill row with a sliding accent indicator; each option has testID `segment-<value>`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/ui/segmented-control.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { SegmentedControl } from './segmented-control';

const OPTS = [
  { value: 'all', label: 'All' },
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
];

describe('SegmentedControl', () => {
  it('renders options and fires onChange on press', async () => {
    const onChange = jest.fn();
    await render(<SegmentedControl options={OPTS} value="all" onChange={onChange} />);
    expect(screen.getByText('Expense')).toBeTruthy();
    fireEvent.press(screen.getByTestId('segment-income'));
    expect(onChange).toHaveBeenCalledWith('income');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/ui/segmented-control.test.tsx`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/mobile/src/components/ui/segmented-control.tsx
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const [w, setW] = useState(0);
  const cell = options.length ? (w - 8) / options.length : 0; // minus the p-1 (4px) frame
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const tx = useRef(new Animated.Value(0)).current;
  const firstLayout = useRef(true);

  useEffect(() => {
    if (cell <= 0) return;
    const to = idx * cell;
    if (firstLayout.current) {
      tx.setValue(to);
      firstLayout.current = false;
    } else {
      Animated.spring(tx, { toValue: to, useNativeDriver: true, stiffness: 200, damping: 22, mass: 1 }).start();
    }
  }, [idx, cell, tx]);

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} className="flex-row rounded-xl bg-surface-2 p-1">
      {cell > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 4,
            bottom: 4,
            left: 4,
            width: cell,
            borderRadius: 8,
            backgroundColor: '#1d6ef5',
            transform: [{ translateX: tx }],
          }}
        />
      ) : null}
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={`segment-${o.value}`}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className="flex-1 items-center justify-center py-2"
          >
            <Text className={`text-sm font-medium ${active ? 'text-white' : 'text-muted'}`}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/ui/segmented-control.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/ui/segmented-control.tsx apps/mobile/src/components/ui/segmented-control.test.tsx
git commit -m "feat(mobile): SegmentedControl primitive (sliding accent indicator)"
```

---

### Task 5: DatePicker primitive

**Files:**
- Create: `apps/mobile/src/components/ui/date-picker.tsx`
- Test: `apps/mobile/src/components/ui/date-picker.test.tsx`

**Interfaces:**
- Consumes: `BottomSheet` (Task 3); `parseISO`/`toISO`/`daysInMonth`/`firstWeekday`/`MONTHS_LONG`/`WEEKDAYS` (Task 1).
- Produces: `DatePicker({ value, onChange, placeholder?, accessibilityLabel? }: { value: string; onChange: (v: string) => void; placeholder?: string; accessibilityLabel?: string })` — value is ISO `'YYYY-MM-DD'` or `''`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/ui/date-picker.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { DatePicker } from './date-picker';

describe('DatePicker', () => {
  it('shows the placeholder when empty', async () => {
    await render(<DatePicker value="" onChange={jest.fn()} placeholder="Pick a date" />);
    expect(screen.getByText('Pick a date')).toBeTruthy();
  });

  it('opens the calendar and selects a day', async () => {
    const onChange = jest.fn();
    await render(<DatePicker value="2026-06-10" onChange={onChange} />);
    fireEvent.press(screen.getByTestId('date-trigger'));
    // Calendar opens on June 2026; pick the 15th.
    fireEvent.press(screen.getByTestId('day-15'));
    expect(onChange).toHaveBeenCalledWith('2026-06-15');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/ui/date-picker.test.tsx`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/mobile/src/components/ui/date-picker.tsx
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BottomSheet } from './bottom-sheet';
import { MONTHS_LONG, WEEKDAYS, daysInMonth, firstWeekday, parseISO, toISO } from '../../lib/calendar';

function label(value: string): string {
  const p = parseISO(value);
  return p ? `${MONTHS_LONG[p.m - 1].slice(0, 3)} ${p.d}, ${p.y}` : '';
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/ui/date-picker.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/ui/date-picker.tsx apps/mobile/src/components/ui/date-picker.test.tsx
git commit -m "feat(mobile): custom on-brand DatePicker (calendar in a bottom sheet)"
```

---

### Task 6: TransactionRow

**Files:**
- Create: `apps/mobile/src/components/transactions/transaction-row.tsx`
- Test: `apps/mobile/src/components/transactions/transaction-row.test.tsx`

**Interfaces:**
- Consumes: `money` from `@finby/core`; `Transaction` from `@finby/shared`.
- Produces: `TransactionRow({ tx, onPress }: { tx: Transaction; onPress: () => void })`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/transactions/transaction-row.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import type { Transaction } from '@finby/shared';
import { TransactionRow } from './transaction-row';

const tx: Transaction = {
  id: 't1', type: 'EXPENSE', status: 'CONFIRMED', amountOriginal: '11.08', currencyOriginal: 'USD',
  amountBase: '11.08', currencyBase: 'USD', fxRateUsed: '1', merchant: 'Pizza Hut', description: null,
  category: { id: 'c1', name: 'Dining' }, account: null, transactionDate: '2026-06-24T10:00:00.000Z',
  tags: ['weekly'], aiConfidence: null, loggedByUserId: 'u1', createdAt: '2026-06-24T10:00:00.000Z',
};

describe('TransactionRow', () => {
  it('renders merchant, category, amount and fires onPress', async () => {
    const onPress = jest.fn();
    await render(<TransactionRow tx={tx} onPress={onPress} />);
    expect(screen.getByText('Pizza Hut')).toBeTruthy();
    expect(screen.getByText('Dining')).toBeTruthy();
    expect(screen.getByText('−$11.08')).toBeTruthy();
    fireEvent.press(screen.getByText('Pizza Hut'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/transactions/transaction-row.test.tsx`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/mobile/src/components/transactions/transaction-row.tsx
import { Platform, Pressable, Text, View } from 'react-native';
import { money } from '@finby/core';
import type { Transaction } from '@finby/shared';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

function tone(type: string): string {
  if (type === 'INCOME') return 'text-success';
  if (type === 'EXPENSE') return 'text-ink';
  return 'text-muted';
}
function sign(type: string): string {
  if (type === 'INCOME') return '+';
  if (type === 'EXPENSE') return '−';
  return '';
}

export function TransactionRow({ tx, onPress }: { tx: Transaction; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="flex-row items-center justify-between gap-3 px-1 py-3">
      <View className="min-w-0 flex-1">
        <Text className="text-sm text-ink" numberOfLines={1}>
          {tx.merchant ?? tx.description ?? 'Transaction'}
        </Text>
        <View className="mt-1 flex-row flex-wrap items-center gap-1.5">
          {tx.category ? (
            <Text className="rounded-md border border-line bg-canvas/60 px-1.5 py-0.5 text-xs text-faint">
              {tx.category.name}
            </Text>
          ) : null}
          {tx.tags.map((t) => (
            <Text key={t} className="rounded-md border border-accent/30 bg-accent-soft px-1.5 py-0.5 text-xs text-accent">
              {t}
            </Text>
          ))}
        </View>
      </View>
      <Text className={`shrink-0 text-sm font-semibold ${tone(tx.type)}`} style={{ fontFamily: MONO }}>
        {sign(tx.type)}
        {money(tx.amountOriginal, tx.currencyOriginal)}
      </Text>
    </Pressable>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/transactions/transaction-row.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/transactions/transaction-row.tsx apps/mobile/src/components/transactions/transaction-row.test.tsx
git commit -m "feat(mobile): transaction row (merchant, category/tag chips, mono signed amount)"
```

---

### Task 7: TransactionFiltersSheet

**Files:**
- Create: `apps/mobile/src/components/transactions/transaction-filters-sheet.tsx`
- Test: `apps/mobile/src/components/transactions/transaction-filters-sheet.test.tsx`

**Interfaces:**
- Consumes: `BottomSheet` (T3), `DatePicker` (T5), `Dropdown`, `Field`, `Button` primitives; `DATE_PRESET_OPTIONS`, `presetRange`, `type DatePreset` (T2); `CURRENCY_CODES`, `Category`, `TransactionQuery` from `@finby/shared`.
- Produces: `TransactionFiltersSheet({ open, onClose, filters, categories, preferredCurrencies, onApply }: { open: boolean; onClose: () => void; filters: TransactionQuery; categories: Category[]; preferredCurrencies: string[]; onApply: (next: TransactionQuery) => void })`. Edits a local draft of category/currency/date and calls `onApply` (preserving `filters.type`/`limit`) on Apply; Reset clears the non-type filters.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/transactions/transaction-filters-sheet.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import type { Category } from '@finby/shared';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { TransactionFiltersSheet } from './transaction-filters-sheet';

const categories: Category[] = [{ id: 'c1', name: 'Dining', isArchived: false }];

describe('TransactionFiltersSheet', () => {
  it('applies the current draft (preserving type)', async () => {
    const onApply = jest.fn();
    await render(
      <TransactionFiltersSheet
        open
        onClose={jest.fn()}
        filters={{ type: 'EXPENSE', categoryId: 'c1' }}
        categories={categories}
        preferredCurrencies={['USD']}
        onApply={onApply}
      />,
    );
    fireEvent.press(screen.getByText('Apply'));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ type: 'EXPENSE', categoryId: 'c1' }));
  });

  it('reset clears the non-type filters', async () => {
    const onApply = jest.fn();
    await render(
      <TransactionFiltersSheet
        open
        onClose={jest.fn()}
        filters={{ type: 'EXPENSE', categoryId: 'c1', currency: 'USD' }}
        categories={categories}
        preferredCurrencies={['USD']}
        onApply={onApply}
      />,
    );
    fireEvent.press(screen.getByText('Reset'));
    expect(onApply).toHaveBeenCalledWith({ type: 'EXPENSE' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/transactions/transaction-filters-sheet.test.tsx`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/mobile/src/components/transactions/transaction-filters-sheet.tsx
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { CURRENCY_CODES, type Category, type TransactionQuery } from '@finby/shared';
import { Button } from '../ui/button';
import { Dropdown } from '../ui/dropdown';
import { Field } from '../ui/field';
import { DatePicker } from '../ui/date-picker';
import { BottomSheet } from '../ui/bottom-sheet';
import { DATE_PRESET_OPTIONS, presetRange, type DatePreset } from '../../lib/transactions-view';

function presetOf(f: TransactionQuery): DatePreset {
  if (f.fromDate || f.toDate) return 'CUSTOM';
  return 'ALL';
}

export function TransactionFiltersSheet({
  open,
  onClose,
  filters,
  categories,
  preferredCurrencies,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  filters: TransactionQuery;
  categories: Category[];
  preferredCurrencies: string[];
  onApply: (next: TransactionQuery) => void;
}) {
  const [categoryId, setCategoryId] = useState(filters.categoryId ?? '');
  const [currency, setCurrency] = useState(filters.currency ?? '');
  const [preset, setPreset] = useState<DatePreset>(presetOf(filters));
  const [fromDate, setFromDate] = useState(filters.fromDate ?? '');
  const [toDate, setToDate] = useState(filters.toDate ?? '');

  // Re-seed the draft from the active filters whenever the sheet opens.
  useEffect(() => {
    if (!open) return;
    setCategoryId(filters.categoryId ?? '');
    setCurrency(filters.currency ?? '');
    setPreset(presetOf(filters));
    setFromDate(filters.fromDate ?? '');
    setToDate(filters.toDate ?? '');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const currencyCodes = preferredCurrencies.length > 0 ? preferredCurrencies : CURRENCY_CODES;
  const categoryOptions = [
    { value: '', label: 'All categories' },
    ...categories.filter((c) => !c.isArchived).map((c) => ({ value: c.id, label: c.name })),
  ];
  const currencyOptions = [{ value: '', label: 'All currencies' }, ...currencyCodes.map((c) => ({ value: c, label: c }))];

  function dateRange(): { fromDate?: string; toDate?: string } {
    if (preset === 'CUSTOM') return { fromDate: fromDate || undefined, toDate: toDate || undefined };
    return presetRange(preset, new Date());
  }

  function apply() {
    onApply({
      type: filters.type,
      limit: filters.limit,
      categoryId: categoryId || undefined,
      currency: currency || undefined,
      ...dateRange(),
    });
    onClose();
  }

  function reset() {
    onApply({ type: filters.type, limit: filters.limit });
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Filters">
      <View className="gap-4">
        <Field label="Category">
          <Dropdown value={categoryId} options={categoryOptions} onSelect={setCategoryId} accessibilityLabel="Filter by category" />
        </Field>
        <Field label="Currency">
          <Dropdown value={currency} options={currencyOptions} onSelect={setCurrency} accessibilityLabel="Filter by currency" />
        </Field>
        <Field label="Date range">
          <Dropdown value={preset} options={DATE_PRESET_OPTIONS} onSelect={setPreset} accessibilityLabel="Date range preset" />
        </Field>
        {preset === 'CUSTOM' ? (
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label="From">
                <DatePicker value={fromDate} onChange={setFromDate} placeholder="Start" accessibilityLabel="From date" />
              </Field>
            </View>
            <View className="flex-1">
              <Field label="To">
                <DatePicker value={toDate} onChange={setToDate} placeholder="End" accessibilityLabel="To date" />
              </Field>
            </View>
          </View>
        ) : null}
        <View className="mt-1 flex-row gap-3">
          <View className="flex-1">
            <Button variant="ghost" onPress={reset}>
              Reset
            </Button>
          </View>
          <View className="flex-1">
            <Button onPress={apply}>Apply</Button>
          </View>
        </View>
      </View>
    </BottomSheet>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/transactions/transaction-filters-sheet.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/transactions/transaction-filters-sheet.tsx apps/mobile/src/components/transactions/transaction-filters-sheet.test.tsx
git commit -m "feat(mobile): transaction filters sheet (category/currency/date presets + custom)"
```

---

### Task 8: EditTransactionSheet

**Files:**
- Create: `apps/mobile/src/components/transactions/edit-transaction-sheet.tsx`
- Test: `apps/mobile/src/components/transactions/edit-transaction-sheet.test.tsx`

**Interfaces:**
- Consumes: `BottomSheet` (T3), `DatePicker` (T5), `Dropdown`, `Input`, `Field`, `Button` primitives; `api.transactions.updateTransaction`/`voidTransaction` via `runtime.native`; `ApiError` from `@finby/core`; `Transaction`, `Category` from `@finby/shared`.
- Produces: `EditTransactionSheet({ open, workspaceId, transaction, categories, onSaved, onVoided, onClose }: { open: boolean; workspaceId: string; transaction: Transaction; categories: Category[]; onSaved: (tx: Transaction) => void; onVoided: (id: string) => void; onClose: () => void })`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/transactions/edit-transaction-sheet.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import type { Transaction, Category } from '@finby/shared';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../lib/runtime.native', () => ({
  api: { transactions: { updateTransaction: jest.fn(), voidTransaction: jest.fn() } },
}));

import { api } from '../../lib/runtime.native';
import { EditTransactionSheet } from './edit-transaction-sheet';

const txns = api.transactions as unknown as {
  updateTransaction: jest.Mock;
  voidTransaction: jest.Mock;
};

const tx: Transaction = {
  id: 't1', type: 'EXPENSE', status: 'CONFIRMED', amountOriginal: '11.08', currencyOriginal: 'USD',
  amountBase: '11.08', currencyBase: 'USD', fxRateUsed: '1', merchant: 'Pizza Hut', description: null,
  category: { id: 'c1', name: 'Dining' }, account: null, transactionDate: '2026-06-24T10:00:00.000Z',
  tags: [], aiConfidence: null, loggedByUserId: 'u1', createdAt: '2026-06-24T10:00:00.000Z',
};
const categories: Category[] = [{ id: 'c1', name: 'Dining', isArchived: false }];

beforeEach(() => {
  txns.updateTransaction.mockReset().mockResolvedValue({ ...tx, merchant: 'Pizza Place' });
  txns.voidTransaction.mockReset().mockResolvedValue({ message: 'ok' });
});

describe('EditTransactionSheet', () => {
  it('saves a patch and reports the updated transaction', async () => {
    const onSaved = jest.fn();
    await render(
      <EditTransactionSheet
        open workspaceId="w1" transaction={tx} categories={categories}
        onSaved={onSaved} onVoided={jest.fn()} onClose={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(txns.updateTransaction).toHaveBeenCalledWith('w1', 't1', expect.objectContaining({
      merchant: 'Pizza Hut', transactionDate: '2026-06-24',
    })));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('voids after confirmation', async () => {
    const onVoided = jest.fn();
    await render(
      <EditTransactionSheet
        open workspaceId="w1" transaction={tx} categories={categories}
        onSaved={jest.fn()} onVoided={onVoided} onClose={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByText('Void'));
    fireEvent.press(screen.getByText('Confirm void'));
    await waitFor(() => expect(txns.voidTransaction).toHaveBeenCalledWith('w1', 't1'));
    await waitFor(() => expect(onVoided).toHaveBeenCalledWith('t1'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/transactions/edit-transaction-sheet.test.tsx`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/mobile/src/components/transactions/edit-transaction-sheet.tsx
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ApiError } from '@finby/core';
import type { Category, Transaction } from '@finby/shared';
import { api } from '../../lib/runtime.native';
import { Button } from '../ui/button';
import { Dropdown } from '../ui/dropdown';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { DatePicker } from '../ui/date-picker';
import { BottomSheet } from '../ui/bottom-sheet';

export function EditTransactionSheet({
  open,
  workspaceId,
  transaction,
  categories,
  onSaved,
  onVoided,
  onClose,
}: {
  open: boolean;
  workspaceId: string;
  transaction: Transaction;
  categories: Category[];
  onSaved: (tx: Transaction) => void;
  onVoided: (id: string) => void;
  onClose: () => void;
}) {
  const [categoryId, setCategoryId] = useState(transaction.category?.id ?? '');
  const [merchant, setMerchant] = useState(transaction.merchant ?? '');
  const [description, setDescription] = useState(transaction.description ?? '');
  const [date, setDate] = useState(transaction.transactionDate.slice(0, 10));
  const [tags, setTags] = useState(transaction.tags.join(', '));
  const [saving, setSaving] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the form each time a (possibly different) transaction opens.
  useEffect(() => {
    if (!open) return;
    setCategoryId(transaction.category?.id ?? '');
    setMerchant(transaction.merchant ?? '');
    setDescription(transaction.description ?? '');
    setDate(transaction.transactionDate.slice(0, 10));
    setTags(transaction.tags.join(', '));
    setConfirmVoid(false);
    setError(null);
  }, [open, transaction]);

  const categoryOptions = [
    { value: '', label: 'Uncategorized' },
    ...categories.filter((c) => !c.isArchived).map((c) => ({ value: c.id, label: c.name })),
  ];

  function fail(e: unknown) {
    setError(e instanceof ApiError ? e.message : 'Something went wrong.');
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const updated = await api.transactions.updateTransaction(workspaceId, transaction.id, {
        categoryId: categoryId || null,
        merchant: merchant.trim() || null,
        description: description.trim() || null,
        transactionDate: date,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      onSaved(updated);
    } catch (e) {
      fail(e);
      setSaving(false);
    }
  }

  async function doVoid() {
    setError(null);
    setVoiding(true);
    try {
      await api.transactions.voidTransaction(workspaceId, transaction.id);
      onVoided(transaction.id);
    } catch (e) {
      fail(e);
      setVoiding(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Edit transaction">
      <View className="gap-4">
        <Text className="text-xs text-faint">
          {transaction.type} · {transaction.amountOriginal} {transaction.currencyOriginal} (amount isn’t editable)
        </Text>
        {error ? (
          <View className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5">
            <Text className="text-sm text-danger">{error}</Text>
          </View>
        ) : null}
        <Field label="Category">
          <Dropdown value={categoryId} options={categoryOptions} onSelect={setCategoryId} accessibilityLabel="Category" />
        </Field>
        <Field label="Merchant">
          <Input value={merchant} onChangeText={setMerchant} placeholder="e.g. Walmart" />
        </Field>
        <Field label="Description">
          <Input value={description} onChangeText={setDescription} placeholder="Optional note" />
        </Field>
        <Field label="Date">
          <DatePicker value={date} onChange={setDate} accessibilityLabel="Transaction date" />
        </Field>
        <Field label="Tags" hint="Comma-separated">
          <Input value={tags} onChangeText={setTags} placeholder="food, weekly" />
        </Field>
        <View className="mt-1 flex-row items-center justify-between">
          {confirmVoid ? (
            <Pressable onPress={() => void doVoid()} accessibilityRole="button" disabled={voiding}>
              <Text className="text-sm font-medium text-danger">{voiding ? 'Voiding…' : 'Confirm void'}</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => setConfirmVoid(true)} accessibilityRole="button">
              <Text className="text-sm text-danger">Void</Text>
            </Pressable>
          )}
          <View className="flex-row gap-2">
            <Button variant="ghost" onPress={onClose}>
              Cancel
            </Button>
            <Button onPress={() => void save()} loading={saving}>
              Save
            </Button>
          </View>
        </View>
      </View>
    </BottomSheet>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/transactions/edit-transaction-sheet.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/transactions/edit-transaction-sheet.tsx apps/mobile/src/components/transactions/edit-transaction-sheet.test.tsx
git commit -m "feat(mobile): edit-transaction sheet (patch fields + void with confirm)"
```

---

### Task 9: TransactionsScreen + route

**Files:**
- Create: `apps/mobile/src/screens/transactions-screen.tsx`
- Modify: `apps/mobile/app/(app)/transactions.tsx` (re-export the real screen)
- Delete: `apps/mobile/src/screens/transactions-placeholder-screen.tsx`, `apps/mobile/src/screens/transactions-placeholder-screen.test.tsx`
- Test: `apps/mobile/src/screens/transactions-screen.test.tsx`

**Interfaces:**
- Consumes: `useAuthStore` (`workspace`); `api.transactions.{listTransactions,listCategories}` via `runtime.native`; `groupByDay`, `presetRange`, `activeFilterCount` (T2); `useTabBarSpace` (`../components/nav/floating-tab-bar`); `SegmentedControl` (T4); `Button`; `TransactionRow` (T6); `TransactionFiltersSheet` (T7); `EditTransactionSheet` (T8); `ApiError` from `@finby/core`; `Transaction`, `TransactionQuery`, `Category` from `@finby/shared`.
- Produces: `TransactionsScreen()` — the full list screen; the route file re-exports it as default.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/screens/transactions-screen.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import type { Transaction } from '@finby/shared';

const authState = { workspace: { id: 'w1', preferredCurrencies: ['USD'] } };
jest.mock('../lib/use-auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector(authState),
}));
jest.mock('../lib/runtime.native', () => ({
  api: { transactions: { listTransactions: jest.fn(), listCategories: jest.fn(), updateTransaction: jest.fn(), voidTransaction: jest.fn() } },
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { api } from '../lib/runtime.native';
import { TransactionsScreen } from './transactions-screen';

const txns = api.transactions as unknown as {
  listTransactions: jest.Mock;
  listCategories: jest.Mock;
};

function tx(id: string, date: string, merchant: string): Transaction {
  return {
    id, type: 'EXPENSE', status: 'CONFIRMED', amountOriginal: '5.00', currencyOriginal: 'USD',
    amountBase: '5.00', currencyBase: 'USD', fxRateUsed: '1', merchant, description: null,
    category: null, account: null, transactionDate: date, tags: [], aiConfidence: null,
    loggedByUserId: 'u1', createdAt: date,
  };
}

beforeEach(() => {
  txns.listCategories.mockReset().mockResolvedValue([]);
  txns.listTransactions.mockReset().mockResolvedValue({
    transactions: [tx('a', '2026-06-24T10:00:00.000Z', 'Pizza Hut')],
    nextCursor: null,
    hasMore: false,
  });
});

describe('TransactionsScreen', () => {
  it('loads and renders transactions', async () => {
    await render(<TransactionsScreen />);
    await waitFor(() => expect(screen.getByText('Pizza Hut')).toBeTruthy());
    expect(txns.listTransactions).toHaveBeenCalled();
  });

  it('reloads with a type filter when the segment changes', async () => {
    await render(<TransactionsScreen />);
    await waitFor(() => expect(screen.getByText('Pizza Hut')).toBeTruthy());
    fireEvent.press(screen.getByTestId('segment-INCOME'));
    await waitFor(() =>
      expect(txns.listTransactions).toHaveBeenLastCalledWith('w1', expect.objectContaining({ type: 'INCOME' })),
    );
  });

  it('shows the empty state when there are no transactions', async () => {
    txns.listTransactions.mockResolvedValue({ transactions: [], nextCursor: null, hasMore: false });
    await render(<TransactionsScreen />);
    await waitFor(() => expect(screen.getByText(/No transactions/)).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/screens/transactions-screen.test.tsx`
Expected: FAIL — cannot find module `./transactions-screen`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/mobile/src/screens/transactions-screen.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, RefreshControl, SectionList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError } from '@finby/core';
import type { Category, Transaction, TransactionQuery } from '@finby/shared';
import { useAuthStore } from '../lib/use-auth-store';
import { api } from '../lib/runtime.native';
import { groupByDay, presetRange, activeFilterCount } from '../lib/transactions-view';
import { useTabBarSpace } from '../components/nav/floating-tab-bar';
import { SegmentedControl } from '../components/ui/segmented-control';
import { Button } from '../components/ui/button';
import { TransactionRow } from '../components/transactions/transaction-row';
import { TransactionFiltersSheet } from '../components/transactions/transaction-filters-sheet';
import { EditTransactionSheet } from '../components/transactions/edit-transaction-sheet';

type TypeValue = '' | 'EXPENSE' | 'INCOME' | 'TRANSFER';
const TYPE_OPTIONS: { value: TypeValue; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'EXPENSE', label: 'Expense' },
  { value: 'INCOME', label: 'Income' },
  { value: 'TRANSFER', label: 'Transfer' },
];

function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Could not load transactions.';
}

export function TransactionsScreen() {
  const workspace = useAuthStore((s) => s.workspace);
  const tabBarSpace = useTabBarSpace();

  const [filters, setFilters] = useState<TransactionQuery>(() => ({ ...presetRange('THIS_MONTH', new Date()), limit: 20 }));
  const [items, setItems] = useState<Transaction[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    if (!workspace) return;
    api.transactions.listCategories(workspace.id).then(setCategories).catch(() => undefined);
  }, [workspace]);

  const reload = useCallback(async () => {
    if (!workspace) return;
    setError(null);
    try {
      const res = await api.transactions.listTransactions(workspace.id, { ...filters, limit: 20 });
      setItems(res.transactions);
      setCursor(res.nextCursor);
      setHasMore(res.hasMore);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [workspace, filters]);

  // (Re)load page 1 whenever filters change.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reload().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  async function loadMore() {
    if (!workspace || !cursor || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await api.transactions.listTransactions(workspace.id, { ...filters, cursor, limit: 20 });
      setItems((prev) => [...prev, ...res.transactions]);
      setCursor(res.nextCursor);
      setHasMore(res.hasMore);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoadingMore(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }

  const sections = groupByDay(items);
  const filterCount = activeFilterCount(filters);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <View className="flex-row items-center justify-between border-b border-line px-4 py-3">
        <Text className="text-2xl font-bold text-ink">Transactions</Text>
        <Button variant="ghost" onPress={() => setFiltersOpen(true)}>
          {filterCount > 0 ? `Filters · ${filterCount}` : 'Filters'}
        </Button>
      </View>

      <View className="px-4 py-3">
        <SegmentedControl
          options={TYPE_OPTIONS}
          value={(filters.type ?? '') as TypeValue}
          onChange={(v) => setFilters((f) => ({ ...f, type: (v || undefined) as TransactionQuery['type'] }))}
        />
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#1d6ef5" />
        </View>
      ) : error ? (
        <View className="items-center gap-3 px-6 py-10">
          <Text className="text-sm text-danger">{error}</Text>
          <Button variant="ghost" onPress={() => void reload()}>
            Retry
          </Button>
        </View>
      ) : items.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-sm text-muted">No transactions match these filters.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(t) => t.id}
          stickySectionHeadersEnabled
          contentContainerStyle={{ paddingBottom: tabBarSpace, paddingHorizontal: 16 }}
          onEndReachedThreshold={0.4}
          onEndReached={() => void loadMore()}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8da3c0" />}
          renderSectionHeader={({ section }) => (
            <Text className="bg-canvas py-2 text-xs font-semibold uppercase tracking-wide text-muted">
              {section.title}
            </Text>
          )}
          renderItem={({ item, index }) => <AnimatedRow index={index} tx={item} onPress={() => setEditing(item)} />}
          ListFooterComponent={
            loadingMore ? (
              <View className="py-4">
                <ActivityIndicator color="#8da3c0" />
              </View>
            ) : null
          }
        />
      )}

      <TransactionFiltersSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        categories={categories}
        preferredCurrencies={workspace?.preferredCurrencies ?? []}
        onApply={setFilters}
      />

      {editing && workspace ? (
        <EditTransactionSheet
          open
          workspaceId={workspace.id}
          transaction={editing}
          categories={categories}
          onSaved={(u) => {
            setItems((prev) => prev.map((t) => (t.id === u.id ? u : t)));
            setEditing(null);
          }}
          onVoided={(id) => {
            setItems((prev) => prev.filter((t) => t.id !== id));
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}

/** A row that fades + rises in on mount, staggered by its position on the page. */
function AnimatedRow({ index, tx, onPress }: { index: number; tx: Transaction; onPress: () => void }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 220,
      delay: Math.min(index, 8) * 28,
      useNativeDriver: true,
    }).start();
  }, [anim, index]);
  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
      }}
    >
      <TransactionRow tx={tx} onPress={onPress} />
    </Animated.View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/screens/transactions-screen.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Swap the route + delete the placeholder**

Replace the contents of `apps/mobile/app/(app)/transactions.tsx` with:
```tsx
// apps/mobile/app/(app)/transactions.tsx
export { TransactionsScreen as default } from '../../src/screens/transactions-screen';
```
Then delete the placeholder and its test:
```bash
git rm apps/mobile/src/screens/transactions-placeholder-screen.tsx apps/mobile/src/screens/transactions-placeholder-screen.test.tsx
```
Confirm nothing else imports the placeholder:
```bash
grep -rn "transactions-placeholder" apps/mobile/src apps/mobile/app
```
Expected: no matches.

- [ ] **Step 6: Run the screen test**

Run: `npx jest src/screens/transactions-screen.test.tsx`
Expected: PASS. (The placeholder test is now deleted.)

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/screens/transactions-screen.tsx apps/mobile/src/screens/transactions-screen.test.tsx apps/mobile/app/\(app\)/transactions.tsx
git commit -m "feat(mobile): transactions screen (grouped infinite list, filters, edit) + route"
```

---

### Task 10: Full gate + bundle sanity

**Files:** none (verification only).

- [ ] **Step 1: Typed-routes regen, then typecheck**

The route file changed; regenerate the typed routes then typecheck:
```bash
EXPO_NO_TELEMETRY=1 CI=1 npx expo start --port 8099
npx tsc --noEmit
```
Expected: tsc exits 0. (If route-href errors appear, re-run the `expo start` line.)

- [ ] **Step 2: Full mobile suite**

Run (from `apps/mobile`): `pnpm test`
Expected: all vitest + jest suites pass (existing + the new calendar/view/primitive/feature/screen tests). Output pristine (no warnings).

- [ ] **Step 3: Lint**

Run (from repo root `/home/unicorn/Documents/finby`): `pnpm lint`
Expected: 0 errors (the pre-existing `apps/web/public/sw.js` `_e` warning is OK).

- [ ] **Step 4: Headless bundle sanity**

Run (from `apps/mobile`):
```bash
EXPO_NO_TELEMETRY=1 npx expo export:embed --platform ios --dev false --bundle-output /tmp/finby-5c.js
grep -c 'SharedArrayBuffer.prototype' /tmp/finby-5c.js
```
Expected: bundle writes; the grep prints `0`.

- [ ] **Step 5: Commit (only if a fix was needed)**

If any step required a code fix, commit it atomically (no AI-attribution trailer). If nothing changed, skip.

- [ ] **Step 6: Device verification handoff (manual, user)**

In Expo Go (`pnpm --filter finby-mobile start`), on the Transactions tab confirm: rows grouped under Today/Yesterday/date headers with a staggered fade-in; pull-to-refresh; scrolling to the bottom loads more; the Type segment slides + reloads; the Filters sheet (category/currency/date presets + custom range via the calendar) applies/resets; tapping a row opens the edit sheet (save updates in place; void → confirm removes it).

---

## Spec Coverage Check

- Day-grouped list (Today/Yesterday/date) → Task 2 (`groupByDay`), Task 9 (SectionList).
- Infinite scroll + pull-to-refresh → Task 9.
- Staggered entry animation → Task 9 (`AnimatedRow`).
- Always-visible Type segmented control → Task 4, Task 9.
- Filter sheet (category/currency/date presets + custom range) + active-count badge → Tasks 2, 5, 7, 9.
- Edit sheet (category/merchant/description/date/tags + void confirm) → Task 8.
- Custom on-brand DatePicker (no native control) → Tasks 1, 5.
- BottomSheet + SegmentedControl primitives → Tasks 3, 4.
- TransactionRow (mono signed toned amount, chips) → Task 6.
- States (loading/error/empty/loading-more) → Task 9.
- Placeholder removal + route swap → Task 9.
- Reuse api.transactions / money / dayLabel / Dropdown-Input-Field → Tasks 2, 6, 7, 8, 9.
- Out of scope (no receipt scanner, no swipe, no create) → respected throughout.
- Gate (suite + tsc + lint + bundle) → Task 10.
