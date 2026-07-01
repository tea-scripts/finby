# Dashboard Money+Insights — Plan A2 (Mobile) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the redesigned mobile Dashboard — month selector, spending donut, 6-month trend, and insight card — on top of the A1 backend, with tier-gated month navigation.

**Architecture:** Pure geometry helpers (donut arcs, trend spline) + `@finby/core` month helpers feed thin `react-native-svg` chart components. The `DashboardScreen` holds a `selectedMonth` and refetches the month-scoped sections (summary/by-category/insight) from `api.dashboard.*` (shipped in A1). Reuses `MonthSummary`/`AccountCarousel`/`BudgetList`; removes `RecentTransactions`.

**Tech Stack:** React Native + Expo, `react-native-svg` (15.12.1, already installed), NativeWind; Vitest (`@finby/core` + mobile logic via `test:logic`), Jest + React Native Testing Library (mobile components).

## Global Constraints

- Package manager **pnpm** (v10, turbo). Filters: `@finby/core`, `finby-mobile`. No AI-attribution trailers.
- Mobile components tested with **jest + React Native Testing Library v14** (`pnpm --filter finby-mobile test:components -- <name>`); pure logic with vitest (`test:logic`). RNTL v14 has NO `UNSAFE_getByType`; decorative elements (`accessibilityElementsHidden`) need `{ includeHiddenElements: true }` and `@expo/vector-icons` is mocked to render its `name` (see `apps/mobile/src/components/category/category-avatar.test.tsx`).
- Build `@finby/core` + `@finby/shared` BEFORE running mobile `typecheck` (turbo `^build` is bypassed by `pnpm --filter`): `pnpm --filter @finby/core build && pnpm --filter @finby/shared build && pnpm --filter finby-mobile typecheck`.
- Repo uses `noUncheckedIndexedAccess: true` — guard array indexing (charts index arrays heavily).
- Build custom, no new UI/chart deps — charts are hand-built with the installed `react-native-svg`.
- Reuse the existing upsell: `PlanCarouselSheet` (`apps/mobile/src/components/billing/plan-carousel-sheet.tsx`, props `{ open, onClose, currentTier }`). There is NO `/subscription` route (retired).
- Tier source: `useAuthStore((s) => s.workspace?.tier ?? 'FREE')`. History floor: `earliestAllowedMonthStart(tier)` from `@finby/shared` (A1).
- Month-scope rules: cards/donut/insight follow `selectedMonth`; accounts always; budgets only when `selectedMonth` is the current month; trend is a fixed trailing window.

---

### Task 1: `@finby/core` month helpers

**Files:**
- Modify: `packages/core/src/format.ts` (add helpers near `currentMonthRange`, ~line 101)
- Modify: `packages/core/src/index.ts` (export the new helpers)
- Test: `packages/core/src/format.test.ts` (or a new `month.test.ts` if `format.test.ts` is absent — check first)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `type MonthRef = { year: number; month: number }` (month 0-based)
  - `currentMonth(now?: Date): MonthRef`
  - `addMonths(ref: MonthRef, delta: number): MonthRef`
  - `monthToRange(ref: MonthRef, now?: Date): { from: string; to: string }` (from = first day; to = today if `ref` is the current month, else last day — all YYYY-MM-DD UTC)
  - `formatMonthLabel(ref: MonthRef, now?: Date): string` (e.g. `"June"` for the current year, `"May 2025"` otherwise)

- [ ] **Step 1: Write the failing test**

Add to `packages/core/src/format.test.ts` (mirror the file's existing `import { ... } from './format'` + vitest style):

```ts
import { addMonths, currentMonth, formatMonthLabel, monthToRange } from './format';

describe('month helpers', () => {
  const JUL = new Date('2026-07-15T00:00:00.000Z');

  it('currentMonth returns 0-based month', () => {
    expect(currentMonth(JUL)).toEqual({ year: 2026, month: 6 });
  });

  it('addMonths rolls across year boundaries', () => {
    expect(addMonths({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(addMonths({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
  });

  it('monthToRange caps the current month at today, past months at month end', () => {
    expect(monthToRange({ year: 2026, month: 6 }, JUL)).toEqual({ from: '2026-07-01', to: '2026-07-15' });
    expect(monthToRange({ year: 2026, month: 4 }, JUL)).toEqual({ from: '2026-05-01', to: '2026-05-31' });
  });

  it('formatMonthLabel omits the year only for the current year', () => {
    expect(formatMonthLabel({ year: 2026, month: 6 }, JUL)).toBe('July');
    expect(formatMonthLabel({ year: 2025, month: 4 }, JUL)).toBe('May 2025');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @finby/core test -- format`
Expected: FAIL — `addMonths` (etc.) not exported.

- [ ] **Step 3: Implement the helpers**

In `packages/core/src/format.ts`, add after `currentMonthRange`:

```ts
export type MonthRef = { year: number; month: number }; // month is 0-based

export function currentMonth(now: Date = new Date()): MonthRef {
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() };
}

export function addMonths(ref: MonthRef, delta: number): MonthRef {
  const d = new Date(Date.UTC(ref.year, ref.month + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

/** from = first of the month; to = today when `ref` is the current month, else
 *  the last day of that month. All YYYY-MM-DD (UTC). */
export function monthToRange(ref: MonthRef, now: Date = new Date()): { from: string; to: string } {
  const start = new Date(Date.UTC(ref.year, ref.month, 1));
  const end = new Date(Date.UTC(ref.year, ref.month + 1, 0));
  const isCurrent = ref.year === now.getUTCFullYear() && ref.month === now.getUTCMonth();
  const to = isCurrent ? now : end;
  return { from: start.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function formatMonthLabel(ref: MonthRef, now: Date = new Date()): string {
  const name = MONTH_NAMES[ref.month] ?? '';
  return ref.year === now.getUTCFullYear() ? name : `${name} ${ref.year}`;
}
```

- [ ] **Step 4: Export**

In `packages/core/src/index.ts`, extend the `./format` export line to include the new names:

```ts
export {
  money, shortDate, timeOfDay, dayKey, dayLabel, currentMonthRange,
  currentMonth, addMonths, monthToRange, formatMonthLabel,
} from './format';
export type { MonthRef } from './format';
```

- [ ] **Step 5: Run test + build**

Run: `pnpm --filter @finby/core test -- format` → PASS; `pnpm --filter @finby/core build` → succeeds.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/format.ts packages/core/src/index.ts packages/core/src/format.test.ts
git commit -m "feat(core): month-navigation helpers (MonthRef, addMonths, monthToRange, formatMonthLabel)"
```

---

### Task 2: Donut geometry (pure)

**Files:**
- Create: `apps/mobile/src/components/charts/donut-geometry.ts`
- Test: `apps/mobile/src/components/charts/donut-geometry.test.ts`

**Interfaces:**
- Produces: `donutSegments(values: number[], circumference: number): { length: number; offset: number }[]` — for a stroked-circle donut, each segment's dash `length` and cumulative `offset` (both in the same units as `circumference`). Zero-total input → all zero-length segments.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/components/charts/donut-geometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { donutSegments } from './donut-geometry';

describe('donutSegments', () => {
  it('splits the circumference proportionally with cumulative offsets', () => {
    const segs = donutSegments([1, 3], 100); // total 4 → 25 / 75
    expect(segs).toHaveLength(2);
    expect(segs[0]).toEqual({ length: 25, offset: 0 });
    expect(segs[1]).toEqual({ length: 75, offset: 25 });
  });

  it('returns zero-length segments when the total is zero', () => {
    expect(donutSegments([0, 0], 100)).toEqual([
      { length: 0, offset: 0 },
      { length: 0, offset: 0 },
    ]);
  });

  it('handles a single value as the full ring', () => {
    expect(donutSegments([5], 100)).toEqual([{ length: 100, offset: 0 }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter finby-mobile test:logic -- donut-geometry`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/mobile/src/components/charts/donut-geometry.ts`:

```ts
/** Dash lengths + cumulative offsets for a stroked-circle donut. Each segment i
 *  covers `values[i]/total` of `circumference`; `offset` is where it starts. */
export function donutSegments(
  values: number[],
  circumference: number,
): { length: number; offset: number }[] {
  const total = values.reduce((a, v) => a + (v > 0 ? v : 0), 0);
  const out: { length: number; offset: number }[] = [];
  let acc = 0;
  for (const v of values) {
    const length = total > 0 ? (Math.max(0, v) / total) * circumference : 0;
    out.push({ length, offset: acc });
    acc += length;
  }
  return out;
}
```

- [ ] **Step 4: Run test → PASS**

Run: `pnpm --filter finby-mobile test:logic -- donut-geometry` → PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/charts/donut-geometry.ts apps/mobile/src/components/charts/donut-geometry.test.ts
git commit -m "feat(mobile): pure donut-segment geometry"
```

---

### Task 3: Trend geometry (pure)

**Files:**
- Create: `apps/mobile/src/components/charts/trend-geometry.ts`
- Test: `apps/mobile/src/components/charts/trend-geometry.test.ts`

**Interfaces:**
- Produces: `trendGeometry(values: number[], dims: { width: number; height: number; padding: number }): { line: string; area: string; points: { x: number; y: number }[] }` — evenly-spaced x, y scaled to [min,max] (flat series → mid-height), smoothed `line` path (Catmull-Rom → cubic bezier), `area` closes the line to the bottom, `points` are the raw vertices (for dots). `< 2` values → straight/degenerate but non-throwing.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/components/charts/trend-geometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { trendGeometry } from './trend-geometry';

const DIMS = { width: 300, height: 100, padding: 10 };

describe('trendGeometry', () => {
  it('places evenly-spaced points spanning the padded width', () => {
    const g = trendGeometry([1, 2, 3], DIMS);
    expect(g.points).toHaveLength(3);
    expect(g.points[0].x).toBeCloseTo(10, 5); // padding
    expect(g.points[2].x).toBeCloseTo(290, 5); // width - padding
    expect(g.line.startsWith('M')).toBe(true);
    expect(g.area.startsWith('M')).toBe(true);
  });

  it('maps the max value to the top padding and the min to the bottom', () => {
    const g = trendGeometry([0, 10], DIMS);
    expect(g.points[1].y).toBeCloseTo(10, 5); // max → top (padding)
    expect(g.points[0].y).toBeCloseTo(90, 5); // min → height - padding
  });

  it('renders a flat series at mid-height without NaN', () => {
    const g = trendGeometry([5, 5, 5], DIMS);
    for (const p of g.points) expect(Number.isNaN(p.y)).toBe(false);
    expect(g.points[0].y).toBeCloseTo(50, 5);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter finby-mobile test:logic -- trend-geometry`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/mobile/src/components/charts/trend-geometry.ts`:

```ts
export interface TrendDims {
  width: number;
  height: number;
  padding: number;
}

/** Evenly-spaced points scaled into the padded box; smoothed line + filled area. */
export function trendGeometry(
  values: number[],
  dims: TrendDims,
): { line: string; area: string; points: { x: number; y: number }[] } {
  const { width, height, padding } = dims;
  const n = values.length;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min;

  const points = values.map((v, i) => {
    const x = n <= 1 ? padding : padding + (innerW * i) / (n - 1);
    const y = span === 0 ? padding + innerH / 2 : padding + innerH * (1 - (v - min) / span);
    return { x, y };
  });

  if (points.length === 0) return { line: '', area: '', points };

  // Catmull-Rom → cubic bezier for a smooth line.
  let line = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    line += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }

  const last = points[points.length - 1];
  const first = points[0];
  const area = `${line} L ${last.x} ${height - padding} L ${first.x} ${height - padding} Z`;

  return { line, area, points };
}
```

- [ ] **Step 4: Run test → PASS**

Run: `pnpm --filter finby-mobile test:logic -- trend-geometry` → PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/charts/trend-geometry.ts apps/mobile/src/components/charts/trend-geometry.test.ts
git commit -m "feat(mobile): pure trend-spline geometry"
```

---

### Task 4: `SpendingDonut` component

**Files:**
- Create: `apps/mobile/src/components/dashboard/spending-donut.tsx`
- Test: `apps/mobile/src/components/dashboard/spending-donut.test.tsx`

**Interfaces:**
- Consumes: `donutSegments` (Task 2); `CategoryBreakdownResult` from `@finby/shared`; `CategoryAvatar`, `resolveCategoryVisual` from category components/shared; `money` from `@finby/core`; `SectionProps`/`SectionCard`/loading/error/empty from `./section-card`.
- Produces: `SpendingDonut({ state }: SectionProps<CategoryBreakdownResult>)`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/components/dashboard/spending-donut.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native';
import type { CategoryBreakdownResult } from '@finby/shared';
import { SpendingDonut } from './spending-donut';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));

const data: CategoryBreakdownResult = {
  currency: 'USD',
  breakdown: [
    { category: { id: 'c1', name: 'Food & Dining', icon: 'utensils', color: '#E2683C' }, total: '965', percent: 49, transactionCount: 12 },
    { category: { id: 'c2', name: 'Shopping', icon: 'bag', color: '#EC4899' }, total: '508', percent: 26, transactionCount: 6 },
  ],
};

describe('SpendingDonut', () => {
  it('renders the spent total and a legend row per category', async () => {
    await render(<SpendingDonut state={{ data, loading: false, error: null }} onRetry={() => {}} />);
    expect(screen.getByText(/1,473/, { includeHiddenElements: true })).toBeTruthy(); // 965 + 508
    expect(screen.getByText('Food & Dining')).toBeTruthy();
    expect(screen.getByText('Shopping')).toBeTruthy();
  });

  it('shows an empty state when there is no spending', async () => {
    await render(<SpendingDonut state={{ data: { currency: 'USD', breakdown: [] }, loading: false, error: null }} onRetry={() => {}} />);
    expect(screen.getByText(/no spending/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter finby-mobile test:components -- spending-donut`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/mobile/src/components/dashboard/spending-donut.tsx`:

```tsx
import { Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { money } from '@finby/core';
import { resolveCategoryVisual, type CategoryBreakdownResult } from '@finby/shared';
import { SectionCard, SectionLoading, SectionError, SectionEmpty, type SectionProps } from './section-card';
import { CategoryAvatar } from '../category/category-avatar';
import { donutSegments } from '../charts/donut-geometry';

const SIZE = 132;
const STROKE = 18;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

export function SpendingDonut({ state, onRetry }: SectionProps<CategoryBreakdownResult>) {
  return (
    <SectionCard title="Spending">
      {state.loading ? (
        <SectionLoading />
      ) : state.error || !state.data ? (
        <SectionError onRetry={onRetry} />
      ) : state.data.breakdown.length === 0 ? (
        <SectionEmpty message="No spending this month." />
      ) : (
        <Content data={state.data} />
      )}
    </SectionCard>
  );
}

function Content({ data }: { data: CategoryBreakdownResult }) {
  const values = data.breakdown.map((b) => Number(b.total));
  const total = values.reduce((a, v) => a + v, 0);
  const segments = donutSegments(values, C);
  return (
    <View className="flex-row items-center gap-4">
      <View style={{ width: SIZE, height: SIZE }}>
        <Svg width={SIZE} height={SIZE}>
          <G rotation={-90} originX={SIZE / 2} originY={SIZE / 2}>
            <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke="#16233a" strokeWidth={STROKE} fill="none" />
            {data.breakdown.map((b, i) => {
              const seg = segments[i];
              if (!seg || seg.length <= 0) return null;
              const color = resolveCategoryVisual(b.category).color;
              return (
                <Circle
                  key={b.category.id}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={R}
                  stroke={color}
                  strokeWidth={STROKE}
                  fill="none"
                  strokeDasharray={`${seg.length} ${C - seg.length}`}
                  strokeDashoffset={-seg.offset}
                />
              );
            })}
          </G>
        </Svg>
        <View className="absolute inset-0 items-center justify-center">
          <Text className="text-[11px] text-muted">Spent</Text>
          <Text className="text-base font-semibold text-ink">{money(String(total), data.currency)}</Text>
        </View>
      </View>
      <View className="min-w-0 flex-1 gap-2">
        {data.breakdown.slice(0, 4).map((b) => (
          <View key={b.category.id} className="flex-row items-center gap-2">
            <CategoryAvatar category={b.category} size="sm" />
            <Text className="min-w-0 flex-1 text-sm text-ink" numberOfLines={1}>{b.category.name}</Text>
            <Text className="text-sm text-muted">{money(b.total, data.currency)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
```

- [ ] **Step 4: Run test → PASS**

Run: `pnpm --filter finby-mobile test:components -- spending-donut` → PASS. Then typecheck: `pnpm --filter @finby/core build && pnpm --filter @finby/shared build && pnpm --filter finby-mobile typecheck` → the new files have no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/dashboard/spending-donut.tsx apps/mobile/src/components/dashboard/spending-donut.test.tsx
git commit -m "feat(mobile): SpendingDonut chart + category legend"
```

---

### Task 5: `SpendTrend` component

**Files:**
- Create: `apps/mobile/src/components/dashboard/spend-trend.tsx`
- Test: `apps/mobile/src/components/dashboard/spend-trend.test.tsx`

**Interfaces:**
- Consumes: `trendGeometry` (Task 3); `TrendResult` from `@finby/shared`; `SectionProps`/wrapper from `./section-card`.
- Produces: `SpendTrend({ state }: SectionProps<TrendResult>)` — plots monthly **expenses**, month labels, highlighted last point.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/components/dashboard/spend-trend.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native';
import type { TrendResult } from '@finby/shared';
import { SpendTrend } from './spend-trend';

const data: TrendResult = {
  currency: 'USD',
  trend: [
    { month: '2026-05', income: '4000', expenses: '2200', savings: '1800' },
    { month: '2026-06', income: '4200', expenses: '2540', savings: '1660' },
  ],
};

describe('SpendTrend', () => {
  it('renders a month label for each point', async () => {
    await render(<SpendTrend state={{ data, loading: false, error: null }} onRetry={() => {}} />);
    expect(screen.getByText('May')).toBeTruthy();
    expect(screen.getByText('Jun')).toBeTruthy();
  });

  it('shows an empty state with no data', async () => {
    await render(<SpendTrend state={{ data: { currency: 'USD', trend: [] }, loading: false, error: null }} onRetry={() => {}} />);
    expect(screen.getByText(/not enough/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter finby-mobile test:components -- spend-trend`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/mobile/src/components/dashboard/spend-trend.tsx`:

```tsx
import { Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import type { TrendResult } from '@finby/shared';
import { SectionCard, SectionLoading, SectionError, SectionEmpty, type SectionProps } from './section-card';
import { trendGeometry } from '../charts/trend-geometry';

const W = 320;
const H = 120;
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function label(month: string): string {
  const idx = Number(month.slice(5, 7)) - 1;
  return MONTH_ABBR[idx] ?? month;
}

export function SpendTrend({ state, onRetry }: SectionProps<TrendResult>) {
  return (
    <SectionCard title="6-month trend">
      {state.loading ? (
        <SectionLoading />
      ) : state.error || !state.data ? (
        <SectionError onRetry={onRetry} />
      ) : state.data.trend.length < 2 ? (
        <SectionEmpty message="Not enough history yet." />
      ) : (
        <Content data={state.data} />
      )}
    </SectionCard>
  );
}

function Content({ data }: { data: TrendResult }) {
  const values = data.trend.map((p) => Number(p.expenses));
  const g = trendGeometry(values, { width: W, height: H, padding: 16 });
  const last = g.points[g.points.length - 1];
  return (
    <View className="gap-1.5">
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <LinearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#1d6ef5" stopOpacity={0.28} />
            <Stop offset="1" stopColor="#1d6ef5" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={g.area} fill="url(#trendFill)" />
        <Path d={g.line} stroke="#1d6ef5" strokeWidth={2.5} fill="none" />
        {last ? <Circle cx={last.x} cy={last.y} r={4} fill="#1d6ef5" /> : null}
      </Svg>
      <View className="flex-row justify-between px-1">
        {data.trend.map((p, i) => (
          <Text
            key={p.month}
            className={`text-[11px] ${i === data.trend.length - 1 ? 'text-accent' : 'text-muted'}`}
          >
            {label(p.month)}
          </Text>
        ))}
      </View>
    </View>
  );
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm --filter finby-mobile test:components -- spend-trend` → PASS.
Run: `pnpm --filter @finby/core build && pnpm --filter @finby/shared build && pnpm --filter finby-mobile typecheck` → new files clean.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/dashboard/spend-trend.tsx apps/mobile/src/components/dashboard/spend-trend.test.tsx
git commit -m "feat(mobile): SpendTrend spline chart"
```

---

### Task 6: `InsightCard` component

**Files:**
- Create: `apps/mobile/src/components/dashboard/insight-card.tsx`
- Test: `apps/mobile/src/components/dashboard/insight-card.test.tsx`

**Interfaces:**
- Consumes: `InsightResult` from `@finby/shared`; `money` from `@finby/core`; `SectionProps`/wrapper.
- Produces: `InsightCard({ state }: SectionProps<InsightResult>)` — a soft card; colored delta %, bold projected savings (current month only), hides the projection clause when `projectionApplies` is false.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/components/dashboard/insight-card.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native';
import type { InsightResult } from '@finby/shared';
import { InsightCard } from './insight-card';

function base(over: Partial<InsightResult>): InsightResult {
  return {
    period: { from: '2026-07-01', to: '2026-07-15' },
    currency: 'USD',
    direction: 'less',
    spendDeltaPercent: 12,
    projectionApplies: true,
    projectedSpend: '2000.00',
    projectedSavings: '1940.00',
    comparedTo: { from: '2026-06-01', to: '2026-06-30' },
    message: 'You\'re on pace to spend 12% less than last month.',
    ...over,
  };
}

describe('InsightCard', () => {
  it('shows the delta and the projected savings for the current month', async () => {
    await render(<InsightCard state={{ data: base({}), loading: false, error: null }} onRetry={() => {}} />);
    expect(screen.getByText(/12% less/)).toBeTruthy();
    expect(screen.getByText(/1,940/)).toBeTruthy();
  });

  it('omits the savings projection for a past month', async () => {
    const past = base({ projectionApplies: false, projectedSavings: null, projectedSpend: null });
    await render(<InsightCard state={{ data: past, loading: false, error: null }} onRetry={() => {}} />);
    expect(screen.getByText(/12% less/)).toBeTruthy();
    expect(screen.queryByText(/save/i)).toBeNull();
  });

  it('renders the flat/no-history message plainly', async () => {
    const flat = base({ direction: 'flat', spendDeltaPercent: 0, message: 'Not enough history yet to compare to last month.' });
    await render(<InsightCard state={{ data: flat, loading: false, error: null }} onRetry={() => {}} />);
    expect(screen.getByText(/not enough history/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter finby-mobile test:components -- insight-card`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/mobile/src/components/dashboard/insight-card.tsx`:

```tsx
import { Text, View } from 'react-native';
import { money } from '@finby/core';
import type { InsightResult } from '@finby/shared';
import { SectionLoading, SectionError, type SectionProps } from './section-card';

export function InsightCard({ state, onRetry }: SectionProps<InsightResult>) {
  if (state.loading) return <SectionLoading />;
  if (state.error || !state.data) return <SectionError onRetry={onRetry} />;
  const d = state.data;

  // Flat / no-history → plain server message.
  if (d.direction === 'flat') {
    return (
      <View className="rounded-2xl border border-line bg-surface p-4">
        <Text className="text-sm text-muted">{d.message}</Text>
      </View>
    );
  }

  const deltaColor = d.direction === 'less' ? 'text-success' : 'text-danger';
  const lead = d.projectionApplies ? "You're on pace to spend " : 'You spent ';
  const cmp = d.projectionApplies ? ' than last month.' : ' than the month before.';
  const showSavings = d.projectionApplies && d.projectedSavings !== null && Number(d.projectedSavings) > 0;

  return (
    <View className="rounded-2xl border border-line bg-surface p-4">
      <Text className="text-sm text-ink">
        {lead}
        <Text className={`font-semibold ${deltaColor}`}>
          {d.spendDeltaPercent}% {d.direction}
        </Text>
        {cmp}
        {showSavings ? (
          <Text className="text-ink">
            {' '}At this rate you'll save{' '}
            <Text className="font-semibold text-ink">{money(d.projectedSavings as string, d.currency)}</Text>
            {' '}this month.
          </Text>
        ) : null}
      </Text>
    </View>
  );
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm --filter finby-mobile test:components -- insight-card` → PASS (3 tests).
Run: `pnpm --filter @finby/core build && pnpm --filter @finby/shared build && pnpm --filter finby-mobile typecheck` → new file clean.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/dashboard/insight-card.tsx apps/mobile/src/components/dashboard/insight-card.test.tsx
git commit -m "feat(mobile): InsightCard (styled delta + projected savings)"
```

---

### Task 7: `MonthSelector` component (with tier-gated reach + upsell)

**Files:**
- Create: `apps/mobile/src/components/dashboard/month-selector.tsx`
- Test: `apps/mobile/src/components/dashboard/month-selector.test.tsx`

**Interfaces:**
- Consumes: `MonthRef`, `addMonths`, `currentMonth`, `formatMonthLabel` from `@finby/core`; `earliestAllowedMonthStart` from `@finby/shared`; `PlanCarouselSheet` from `../billing/plan-carousel-sheet`; `Ionicons`.
- Produces: `MonthSelector({ month, onChange, tier }: { month: MonthRef; onChange: (m: MonthRef) => void; tier: SubscriptionTier })`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/components/dashboard/month-selector.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { MonthSelector } from './month-selector';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));
// Stub the plan sheet so we can assert it opens without rendering its internals.
jest.mock('../billing/plan-carousel-sheet', () => ({
  PlanCarouselSheet: ({ open }: { open: boolean }) =>
    open ? jest.requireActual<typeof import('react')>('react').createElement('Text', null, 'PLANS_OPEN') : null,
}));

describe('MonthSelector', () => {
  const cur = { year: 2026, month: 6 }; // July 2026 (assume tests run relative to a real "now" >= this is not required; use PRO to avoid now-coupling)

  it('steps back a month on the previous chevron (PRO, unlimited)', async () => {
    const onChange = jest.fn();
    await render(<MonthSelector month={cur} onChange={onChange} tier="PRO" />);
    fireEvent.press(screen.getByLabelText('Previous month'));
    expect(onChange).toHaveBeenCalledWith({ year: 2026, month: 5 });
  });

  it('opens the upgrade sheet instead of navigating when a FREE user hits the history floor', async () => {
    // A far-past month guarantees FREE is at/over the floor regardless of "now".
    const onChange = jest.fn();
    await render(<MonthSelector month={{ year: 2000, month: 0 }} onChange={onChange} tier="FREE" />);
    fireEvent.press(screen.getByLabelText('Previous month'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('PLANS_OPEN')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter finby-mobile test:components -- month-selector`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/mobile/src/components/dashboard/month-selector.tsx`:

```tsx
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
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm --filter finby-mobile test:components -- month-selector` → PASS.
Run: `pnpm --filter @finby/core build && pnpm --filter @finby/shared build && pnpm --filter finby-mobile typecheck` → new file clean.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/dashboard/month-selector.tsx apps/mobile/src/components/dashboard/month-selector.test.tsx
git commit -m "feat(mobile): MonthSelector with tier-gated reach + upgrade upsell"
```

---

### Task 8: Wire the DashboardScreen (compose + month-scoped fetch)

**Files:**
- Modify: `apps/mobile/src/screens/dashboard-screen.tsx`
- Test: `apps/mobile/src/screens/dashboard-screen.test.tsx`

**Interfaces:**
- Consumes: all of Tasks 1–7; `api.dashboard.getByCategory/getTrend/getInsight/getSummary` (A1); reused `MonthSummary`/`AccountCarousel`/`BudgetList`.
- Produces: the composed screen. No downstream consumers.

- [ ] **Step 1: Update the test**

Rewrite `apps/mobile/src/screens/dashboard-screen.test.tsx` to reflect the new composition. Mock `api.dashboard` with the new methods and assert the month-scoped fetch + a couple of sections render. Match the file's existing mock setup for `../lib/runtime.native` and `useAuthStore`; the core assertions:

```tsx
// after mocking api.dashboard.getSummary/listBudgets/listAccounts/getByCategory/getTrend/getInsight
// and useAuthStore to return a workspace { id:'w1', tier:'PRO', baseCurrency:'USD' }:
  it('fetches the month-scoped analytics on mount', async () => {
    await render(<DashboardScreen />);
    expect(api.dashboard.getByCategory).toHaveBeenCalled();
    expect(api.dashboard.getInsight).toHaveBeenCalled();
    expect(api.dashboard.getTrend).toHaveBeenCalled();
    expect(screen.queryByText('Recent transactions')).toBeNull(); // removed
  });
```

(Preserve the file's existing mock scaffolding; add the three new `jest.fn()` methods to the `api.dashboard` mock and provide minimal resolved values: `getByCategory` → `{ breakdown: [], currency: 'USD' }`, `getTrend` → `{ trend: [], currency: 'USD' }`, `getInsight` → a `flat` InsightResult.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter finby-mobile test:components -- dashboard-screen`
Expected: FAIL — new methods not called / RecentTransactions still present.

- [ ] **Step 3: Rewrite the screen**

Rewrite `apps/mobile/src/screens/dashboard-screen.tsx` to: hold `selectedMonth` (default `currentMonth()`), fetch summary/by-category/insight for `monthToRange(selectedMonth)`, fetch trend + accounts once, show budgets only when `selectedMonth` is current, and compose the new layout. Full file:

```tsx
// apps/mobile/src/screens/dashboard-screen.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, currentMonth, monthToRange, type MonthRef } from '@finby/core';
import type {
  AccountView,
  BudgetView,
  CategoryBreakdownResult,
  InsightResult,
  SummaryResult,
  TrendResult,
} from '@finby/shared';
import { useAuthStore } from '../lib/use-auth-store';
import { api } from '../lib/runtime.native';
import type { SectionState } from '../components/dashboard/section-card';
import { MonthSelector } from '../components/dashboard/month-selector';
import { MonthSummary } from '../components/dashboard/month-summary';
import { AccountCarousel } from '../components/dashboard/account-carousel';
import { SpendingDonut } from '../components/dashboard/spending-donut';
import { BudgetList } from '../components/dashboard/budget-list';
import { SpendTrend } from '../components/dashboard/spend-trend';
import { InsightCard } from '../components/dashboard/insight-card';
import { useTabBarSpace } from '../components/nav/floating-tab-bar';

const LOADING = { data: null, loading: true, error: null } as const;

function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Could not load this section.';
}

export function DashboardScreen() {
  const workspace = useAuthStore((s) => s.workspace);
  const tier = workspace?.tier ?? 'FREE';

  const [month, setMonth] = useState<MonthRef>(() => currentMonth());
  const [summary, setSummary] = useState<SectionState<SummaryResult>>(LOADING);
  const [donut, setDonut] = useState<SectionState<CategoryBreakdownResult>>(LOADING);
  const [insight, setInsight] = useState<SectionState<InsightResult>>(LOADING);
  const [budgets, setBudgets] = useState<SectionState<BudgetView[]>>(LOADING);
  const [accounts, setAccounts] = useState<SectionState<AccountView[]>>(LOADING);
  const [trend, setTrend] = useState<SectionState<TrendResult>>(LOADING);
  const [refreshing, setRefreshing] = useState(false);
  const tabBarSpace = useTabBarSpace();

  const now = currentMonth();
  const isCurrentMonth = month.year === now.year && month.month === now.month;

  const loadMonth = useCallback(
    (m: MonthRef) => {
      if (!workspace) return Promise.resolve();
      const { from, to } = monthToRange(m);
      setSummary(LOADING);
      setDonut(LOADING);
      setInsight(LOADING);
      return Promise.all([
        api.dashboard
          .getSummary(workspace.id, from, to)
          .then((d) => setSummary({ data: d, loading: false, error: null }))
          .catch((e) => setSummary({ data: null, loading: false, error: errMsg(e) })),
        api.dashboard
          .getByCategory(workspace.id, from, to, 'EXPENSE')
          .then((d) => setDonut({ data: d, loading: false, error: null }))
          .catch((e) => setDonut({ data: null, loading: false, error: errMsg(e) })),
        api.dashboard
          .getInsight(workspace.id, from, to)
          .then((d) => setInsight({ data: d, loading: false, error: null }))
          .catch((e) => setInsight({ data: null, loading: false, error: errMsg(e) })),
      ]);
    },
    [workspace],
  );

  const loadStatic = useCallback(() => {
    if (!workspace) return Promise.resolve();
    setBudgets(LOADING);
    setAccounts(LOADING);
    setTrend(LOADING);
    return Promise.all([
      api.dashboard
        .listBudgets(workspace.id)
        .then((d) => setBudgets({ data: d, loading: false, error: null }))
        .catch((e) => setBudgets({ data: null, loading: false, error: errMsg(e) })),
      api.dashboard
        .listAccounts(workspace.id)
        .then((d) => setAccounts({ data: d, loading: false, error: null }))
        .catch((e) => setAccounts({ data: null, loading: false, error: errMsg(e) })),
      api.dashboard
        .getTrend(workspace.id)
        .then((d) => setTrend({ data: d, loading: false, error: null }))
        .catch((e) => setTrend({ data: null, loading: false, error: errMsg(e) })),
    ]);
  }, [workspace]);

  const initialized = useRef(false);
  useEffect(() => {
    if (!workspace || initialized.current) return;
    initialized.current = true;
    void loadMonth(month);
    void loadStatic();
  }, [workspace, month, loadMonth, loadStatic]);

  const onSelectMonth = useCallback(
    (m: MonthRef) => {
      setMonth(m);
      void loadMonth(m);
    },
    [loadMonth],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadMonth(month), loadStatic()]);
    setRefreshing(false);
  }, [loadMonth, loadStatic, month]);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <ScrollView
        contentContainerClassName="gap-5 px-4 py-5"
        contentContainerStyle={{ paddingBottom: tabBarSpace }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8da3c0" />}
      >
        <MonthSelector month={month} onChange={onSelectMonth} tier={tier} />
        <MonthSummary state={summary} onRetry={() => loadMonth(month)} />
        <AccountCarousel state={accounts} onRetry={loadStatic} />
        <SpendingDonut state={donut} onRetry={() => loadMonth(month)} />
        {isCurrentMonth ? <BudgetList state={budgets} onRetry={loadStatic} /> : null}
        <SpendTrend state={trend} onRetry={loadStatic} />
        <InsightCard state={insight} onRetry={() => loadMonth(month)} />
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Run the screen test → PASS**

Run: `pnpm --filter finby-mobile test:components -- dashboard-screen` → PASS.

- [ ] **Step 5: Full gate**

Run:
```bash
pnpm --filter @finby/core build
pnpm --filter @finby/shared build
pnpm --filter finby-mobile typecheck   # expect ZERO errors across mobile
pnpm --filter finby-mobile test        # vitest + jest
pnpm lint
```
Expected: all pass (mobile typecheck 0 errors; the removed `RecentTransactions` import is gone; `pnpm lint` 0 errors, the pre-existing `apps/web/public/sw.js` warning is acceptable).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens/dashboard-screen.tsx apps/mobile/src/screens/dashboard-screen.test.tsx
git commit -m "feat(mobile): compose money+insights dashboard with month navigation"
```

---

## Self-Review

**Spec coverage (A2 scope):**
- Month selector + tier-gated reach + upsell → Task 7 (+ Task 1 helpers, A1 `earliestAllowedMonthStart`). ✅
- Spending donut (hand-built SVG, branded legend) → Tasks 2 + 4. ✅
- 6-month trend (hand-built SVG spline, monthly expenses) → Tasks 3 + 5. ✅
- Insight card (styled from structured fields; projection hidden for past months) → Task 6. ✅
- Composition: month selector · cards · accounts · donut · budgets(current-only) · trend · insight; RecentTransactions removed; month-scoped refetch; trend/accounts static → Task 8. ✅
- Out of scope (web parity, chart interactivity, budgets-for-past-months) → untouched. ✅

**Placeholder scan:** No TBD/TODO; every code step has complete code. The dashboard-screen and all components are fully materialized.

**Type consistency:** `MonthRef`/`addMonths`/`monthToRange`/`currentMonth`/`formatMonthLabel` defined in Task 1, consumed identically in Tasks 7 & 8. `donutSegments` (Task 2) → Task 4; `trendGeometry` (Task 3) → Task 5. Components consume the A1-shipped `CategoryBreakdownResult`/`TrendResult`/`InsightResult` and `api.dashboard.getByCategory/getTrend/getInsight` with matching signatures. `SectionProps<T>` reused throughout. `PlanCarouselSheet` props `{ open, onClose, currentTier }` match Task 7's usage.

**Deferred follow-up (from A1 final review):** an early-month projection can be noisy (e.g. day 2). `InsightCard` renders the server's honest "on pace" framing as-is for v1; a min-days-elapsed softening is a future tweak, not in this plan.
