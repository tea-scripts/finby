# Mobile Phase 5a + 5b — Tab Shell + Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the mobile `(app)` area into an Instagram-style bottom-tab navigator (Chat · Dashboard · Transactions · Settings) and build the read-only Dashboard screen, porting the web dashboard via the already-bound `api.dashboard.*`.

**Architecture:** Build the leaf presentational pieces first (tab icon, section primitives, each dashboard section), then the orchestrating DashboardScreen, then wire the `Tabs` navigator last. All dashboard data comes from `@finby/core` `createDashboardApi` (bound as `api.dashboard.*` in `src/lib/runtime.native.ts`) — no API/transport/core changes. Sections fetch independently in parallel (the web `SectionState` pattern) so one failure can't blank the others.

**Tech Stack:** Expo SDK 54, expo-router `Tabs`, NativeWind, `@expo/vector-icons` (Ionicons), jest-expo + @testing-library/react-native (`*.test.tsx`), Vitest (`*.test.ts`). Formatting + data types reused from `@finby/core` (`money`, `shortDate`, `currentMonthRange`, `SectionState`) and `@finby/shared` (`SummaryResult`, `BudgetView`, `AccountView`, `Transaction`, `ApiUser`).

## Global Constraints

- **Branch:** all work on `feat/mobile-phase5a-tabs-dashboard` (already checked out, holds the spec).
- **Custom UI only** — no new native UI deps; Ionicons via the existing `@expo/vector-icons`. No `react-native-svg`/transformer (Metro config is delicate — see SharedArrayBuffer gotcha).
- **Color tokens** (from `src/theme/tokens.ts`): canvas `#06101f`, surface `#0b1626`, surface-2 `#11203a`, line `#1c2c46`, accent `#1d6ef5` (soft `rgba(29,110,245,0.14)` → class `accent-soft`), ink `#e8eef7`, muted `#8da3c0`, faint `#5b6f8c`, success `#1fae6a`, warn `#f5a524`, danger `#ef4444`. RN color *props* take hex literals (not classNames).
- **jest-expo test conventions** (from `mobile-app-architecture` memory): mock the store via a `mock`-prefixed shared object `useAuthStore: (sel) => sel(mockState)`; mock `runtime.native` `api` with mock fns created INSIDE the factory, retrieved via `import { api }`; mock `react-native-safe-area-context`; mock `@expo/vector-icons` as a Text-returning factory; `await` EVERY bare `fireEvent.*` (no explicit `act()`); do NOT put NativeWind components/JSX inside a `jest.mock` factory.
- **Commit style (HARD RULE):** NO AI-attribution trailers / "Generated with" boilerplate. Atomic commits (one logical change each).
- **Route wrappers** under `app/(app)/*.tsx` are one-line re-exports of a `src/screens/` component; test files NEVER live under `app/`.
- **typedRoutes:** adding routes changes the gitignored `apps/mobile/.expo/types/router.d.ts`. Before `tsc`, run `EXPO_NO_TELEMETRY=1 CI=1 npx expo start --port 8099` once (writes types, exits in CI mode).

All commands run from `apps/mobile/` unless noted. Run a single jest file with `npx jest <path>`; a single vitest file with `npx vitest run <path>`.

---

### Task 1: TabBarIcon component

**Files:**
- Create: `apps/mobile/src/components/nav/tab-bar-icon.tsx`
- Test: `apps/mobile/src/components/nav/tab-bar-icon.test.tsx`

**Interfaces:**
- Produces: `TabBarIcon({ outline, filled, focused, color, size }: { outline: keyof typeof Ionicons.glyphMap; filled: keyof typeof Ionicons.glyphMap; focused: boolean; color: string; size: number })` — renders the filled icon on a soft accent pill when focused, else the outline icon.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/nav/tab-bar-icon.test.tsx
import { render, screen } from '@testing-library/react-native';

// Mock Ionicons to render its `name` as text so we can assert which glyph shows.
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    require('react').createElement('Text', null, name),
}));

import { TabBarIcon } from './tab-bar-icon';

describe('TabBarIcon', () => {
  it('shows the filled icon when focused', async () => {
    await render(
      <TabBarIcon outline="grid-outline" filled="grid" focused color="#1d6ef5" size={24} />,
    );
    expect(screen.getByText('grid')).toBeTruthy();
    expect(screen.getByTestId('tab-bar-icon')).toBeTruthy();
  });

  it('shows the outline icon when not focused', async () => {
    await render(
      <TabBarIcon outline="grid-outline" filled="grid" focused={false} color="#8da3c0" size={24} />,
    );
    expect(screen.getByText('grid-outline')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/nav/tab-bar-icon.test.tsx`
Expected: FAIL — cannot find module `./tab-bar-icon`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/mobile/src/components/nav/tab-bar-icon.tsx
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface TabBarIconProps {
  outline: keyof typeof Ionicons.glyphMap;
  filled: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  color: string;
  size: number;
}

/** Instagram-style tab icon: filled glyph on a soft accent pill when active,
 *  outline glyph otherwise. `color`/`size` come from expo-router's Tabs. */
export function TabBarIcon({ outline, filled, focused, color, size }: TabBarIconProps) {
  return (
    <View
      testID="tab-bar-icon"
      className={`items-center justify-center rounded-2xl px-4 py-1 ${focused ? 'bg-accent-soft' : ''}`}
    >
      <Ionicons name={focused ? filled : outline} size={size} color={color} />
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/nav/tab-bar-icon.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/nav/tab-bar-icon.tsx apps/mobile/src/components/nav/tab-bar-icon.test.tsx
git commit -m "feat(mobile): tab-bar icon (filled+pill when active, outline otherwise)"
```

---

### Task 2: Transactions placeholder screen

**Files:**
- Create: `apps/mobile/src/screens/transactions-placeholder-screen.tsx`
- Test: `apps/mobile/src/screens/transactions-placeholder-screen.test.tsx`

**Interfaces:**
- Produces: `TransactionsPlaceholderScreen()` — a "Coming soon" placeholder, replaced by the real screen in slice 5c.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/screens/transactions-placeholder-screen.test.tsx
import { render, screen } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
}));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    require('react').createElement('Text', null, name),
}));

import { TransactionsPlaceholderScreen } from './transactions-placeholder-screen';

describe('TransactionsPlaceholderScreen', () => {
  it('renders the coming-soon copy', async () => {
    await render(<TransactionsPlaceholderScreen />);
    expect(screen.getByText('Transactions')).toBeTruthy();
    expect(screen.getByText(/coming soon/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/screens/transactions-placeholder-screen.test.tsx`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/mobile/src/screens/transactions-placeholder-screen.tsx
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

/** Placeholder for the Transactions tab until slice 5c builds the real list. */
export function TransactionsPlaceholderScreen() {
  return (
    <SafeAreaView className="flex-1 items-center justify-center gap-3 bg-canvas px-6">
      <View className="rounded-full bg-surface p-4">
        <Ionicons name="receipt-outline" size={36} color="#5b6f8c" />
      </View>
      <Text className="text-xl font-semibold text-ink">Transactions</Text>
      <Text className="text-center text-sm text-muted">
        Your full transaction history is coming soon.
      </Text>
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/screens/transactions-placeholder-screen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/transactions-placeholder-screen.tsx apps/mobile/src/screens/transactions-placeholder-screen.test.tsx
git commit -m "feat(mobile): Transactions tab placeholder (coming soon)"
```

---

### Task 3: Section primitives (card + loading/error/empty)

**Files:**
- Create: `apps/mobile/src/components/dashboard/section-card.tsx`
- Test: `apps/mobile/src/components/dashboard/section-card.test.tsx`

**Interfaces:**
- Produces:
  - `type SectionProps<T> = { state: SectionState<T>; onRetry: () => void }` (re-exporting `SectionState` from `@finby/core`).
  - `SectionCard({ title, children }: { title: string; children: ReactNode })`
  - `SectionLoading()` — spinner (testID `section-loading`).
  - `SectionError({ onRetry }: { onRetry: () => void })` — message + Retry (testID `section-retry`).
  - `SectionEmpty({ message }: { message: string })`
- Consumed by Tasks 5–8.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/dashboard/section-card.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SectionCard, SectionLoading, SectionError, SectionEmpty } from './section-card';

describe('section primitives', () => {
  it('SectionCard shows its title and children', async () => {
    await render(
      <SectionCard title="This month">
        <Text>body</Text>
      </SectionCard>,
    );
    expect(screen.getByText('This month')).toBeTruthy();
    expect(screen.getByText('body')).toBeTruthy();
  });

  it('SectionLoading renders a spinner', async () => {
    await render(<SectionLoading />);
    expect(screen.getByTestId('section-loading')).toBeTruthy();
  });

  it('SectionError fires onRetry', async () => {
    const onRetry = jest.fn();
    await render(<SectionError onRetry={onRetry} />);
    fireEvent.press(screen.getByTestId('section-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('SectionEmpty shows its message', async () => {
    await render(<SectionEmpty message="No budgets yet." />);
    expect(screen.getByText('No budgets yet.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/dashboard/section-card.test.tsx`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/mobile/src/components/dashboard/section-card.tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/dashboard/section-card.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/dashboard/section-card.tsx apps/mobile/src/components/dashboard/section-card.test.tsx
git commit -m "feat(mobile): dashboard section primitives (card + loading/error/empty)"
```

---

### Task 4: StreakBadge

**Files:**
- Create: `apps/mobile/src/components/dashboard/streak-badge.tsx`
- Test: `apps/mobile/src/components/dashboard/streak-badge.test.tsx`

**Interfaces:**
- Produces: `StreakBadge({ streak }: { streak: number })` — flame glyph + count (read-only; the interactive streak experience is slice 5d).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/dashboard/streak-badge.test.tsx
import { render, screen } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    require('react').createElement('Text', null, name),
}));

import { StreakBadge } from './streak-badge';

describe('StreakBadge', () => {
  it('shows the streak count with a flame', async () => {
    await render(<StreakBadge streak={5} />);
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('flame')).toBeTruthy();
  });

  it('shows zero', async () => {
    await render(<StreakBadge streak={0} />);
    expect(screen.getByText('0')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/dashboard/streak-badge.test.tsx`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/mobile/src/components/dashboard/streak-badge.tsx
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/** Read-only streak indicator (flame + day count). */
export function StreakBadge({ streak }: { streak: number }) {
  return (
    <View className="flex-row items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5">
      <Ionicons name="flame" size={16} color="#f5a524" />
      <Text className="text-sm font-semibold text-ink">{streak}</Text>
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/dashboard/streak-badge.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/dashboard/streak-badge.tsx apps/mobile/src/components/dashboard/streak-badge.test.tsx
git commit -m "feat(mobile): read-only streak badge"
```

---

### Task 5: MonthSummary section

**Files:**
- Create: `apps/mobile/src/components/dashboard/month-summary.tsx`
- Test: `apps/mobile/src/components/dashboard/month-summary.test.tsx`

**Interfaces:**
- Consumes: `SectionProps<SummaryResult>` from Task 3; `money` from `@finby/core`; `SummaryResult` from `@finby/shared`.
- Produces: `MonthSummary({ state, onRetry }: SectionProps<SummaryResult>)`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/dashboard/month-summary.test.tsx
import { render, screen } from '@testing-library/react-native';
import type { SummaryResult } from '@finby/shared';
import { MonthSummary } from './month-summary';

const data: SummaryResult = {
  period: { from: '2026-06-01', to: '2026-06-25' },
  totalIncome: '5000.00',
  totalExpenses: '1200.50',
  netSavings: '3799.50',
  savingsRate: 76,
  currency: 'USD',
  transactionCount: 12,
};

describe('MonthSummary', () => {
  it('renders income, expenses and net', async () => {
    await render(<MonthSummary state={{ data, loading: false, error: null }} onRetry={jest.fn()} />);
    expect(screen.getByText('$5,000.00')).toBeTruthy();
    expect(screen.getByText('$1,200.50')).toBeTruthy();
    expect(screen.getByText('$3,799.50')).toBeTruthy();
    expect(screen.getByText(/76% saved/)).toBeTruthy();
  });

  it('renders loading', async () => {
    await render(<MonthSummary state={{ data: null, loading: true, error: null }} onRetry={jest.fn()} />);
    expect(screen.getByTestId('section-loading')).toBeTruthy();
  });

  it('renders error with retry', async () => {
    await render(<MonthSummary state={{ data: null, loading: false, error: 'boom' }} onRetry={jest.fn()} />);
    expect(screen.getByTestId('section-retry')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/dashboard/month-summary.test.tsx`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/mobile/src/components/dashboard/month-summary.tsx
import { Text, View } from 'react-native';
import { money } from '@finby/core';
import type { SummaryResult } from '@finby/shared';
import { SectionCard, SectionLoading, SectionError, type SectionProps } from './section-card';

function Row({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  const color = tone === 'pos' ? 'text-success' : tone === 'neg' ? 'text-danger' : 'text-ink';
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-sm text-muted">{label}</Text>
      <Text className={`text-base font-semibold ${color}`}>{value}</Text>
    </View>
  );
}

export function MonthSummary({ state, onRetry }: SectionProps<SummaryResult>) {
  return (
    <SectionCard title="This month">
      {state.loading ? (
        <SectionLoading />
      ) : state.error || !state.data ? (
        <SectionError onRetry={onRetry} />
      ) : (
        <View className="gap-2">
          <Row label="Income" value={money(state.data.totalIncome, state.data.currency)} tone="pos" />
          <Row label="Expenses" value={money(state.data.totalExpenses, state.data.currency)} tone="neg" />
          <View className="my-1 h-px bg-line" />
          <Row label="Net" value={money(state.data.netSavings, state.data.currency)} />
          <Text className="text-xs text-muted">
            {Math.round(state.data.savingsRate)}% saved · {state.data.transactionCount} transactions
          </Text>
        </View>
      )}
    </SectionCard>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/dashboard/month-summary.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/dashboard/month-summary.tsx apps/mobile/src/components/dashboard/month-summary.test.tsx
git commit -m "feat(mobile): dashboard month-summary section"
```

---

### Task 6: BudgetList section

**Files:**
- Create: `apps/mobile/src/components/dashboard/budget-list.tsx`
- Test: `apps/mobile/src/components/dashboard/budget-list.test.tsx`

**Interfaces:**
- Consumes: `SectionProps<BudgetView[]>`; `money`; `BudgetView` from `@finby/shared`.
- Produces: `BudgetList({ state, onRetry }: SectionProps<BudgetView[]>)`. Empty (`[]`) → "No budgets yet."

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/dashboard/budget-list.test.tsx
import { render, screen } from '@testing-library/react-native';
import type { BudgetView } from '@finby/shared';
import { BudgetList } from './budget-list';

const budget: BudgetView = {
  id: 'b1',
  category: { id: 'c1', name: 'Groceries' },
  amountLimit: '500.00',
  amountSpent: '300.00',
  currency: 'USD',
  utilizationPercent: 60,
  period: 'MONTHLY',
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30',
  isActive: true,
};

describe('BudgetList', () => {
  it('renders a budget row with spent/limit', async () => {
    await render(<BudgetList state={{ data: [budget], loading: false, error: null }} onRetry={jest.fn()} />);
    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.getByText('$300.00 / $500.00')).toBeTruthy();
  });

  it('renders empty state', async () => {
    await render(<BudgetList state={{ data: [], loading: false, error: null }} onRetry={jest.fn()} />);
    expect(screen.getByText('No budgets yet.')).toBeTruthy();
  });

  it('renders error with retry', async () => {
    await render(<BudgetList state={{ data: null, loading: false, error: 'x' }} onRetry={jest.fn()} />);
    expect(screen.getByTestId('section-retry')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/dashboard/budget-list.test.tsx`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/mobile/src/components/dashboard/budget-list.tsx
import { Text, View } from 'react-native';
import { money } from '@finby/core';
import type { BudgetView } from '@finby/shared';
import { SectionCard, SectionLoading, SectionError, SectionEmpty, type SectionProps } from './section-card';

function BudgetRow({ b }: { b: BudgetView }) {
  const pct = Math.min(100, Math.max(0, b.utilizationPercent));
  const over = b.utilizationPercent >= 100;
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-medium text-ink">{b.category.name}</Text>
        <Text className="text-xs text-muted">
          {money(b.amountSpent, b.currency)} / {money(b.amountLimit, b.currency)}
        </Text>
      </View>
      <View className="h-2 overflow-hidden rounded-full bg-surface-2">
        <View
          className={`h-2 rounded-full ${over ? 'bg-danger' : 'bg-accent'}`}
          style={{ width: `${pct}%` }}
        />
      </View>
    </View>
  );
}

export function BudgetList({ state, onRetry }: SectionProps<BudgetView[]>) {
  return (
    <SectionCard title="Budgets">
      {state.loading ? (
        <SectionLoading />
      ) : state.error || !state.data ? (
        <SectionError onRetry={onRetry} />
      ) : state.data.length === 0 ? (
        <SectionEmpty message="No budgets yet." />
      ) : (
        <View className="gap-4">
          {state.data.map((b) => (
            <BudgetRow key={b.id} b={b} />
          ))}
        </View>
      )}
    </SectionCard>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/dashboard/budget-list.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/dashboard/budget-list.tsx apps/mobile/src/components/dashboard/budget-list.test.tsx
git commit -m "feat(mobile): dashboard budget-list section"
```

---

### Task 7: AccountCarousel section

**Files:**
- Create: `apps/mobile/src/components/dashboard/account-carousel.tsx`
- Test: `apps/mobile/src/components/dashboard/account-carousel.test.tsx`

**Interfaces:**
- Consumes: `SectionProps<AccountView[]>`; `money`; `AccountView` from `@finby/shared`.
- Produces: `AccountCarousel({ state, onRetry }: SectionProps<AccountView[]>)` — horizontal scroll of account cards; archived accounts excluded. Empty → "No accounts yet."

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/dashboard/account-carousel.test.tsx
import { render, screen } from '@testing-library/react-native';
import type { AccountView } from '@finby/shared';
import { AccountCarousel } from './account-carousel';

const acct: AccountView = {
  id: 'a1',
  name: 'Cash',
  currency: 'USD',
  accountType: 'CASH',
  balance: '1500.00',
  color: '#1fae6a',
  icon: null,
  isArchived: false,
};

describe('AccountCarousel', () => {
  it('renders an account card with name and balance', async () => {
    await render(<AccountCarousel state={{ data: [acct], loading: false, error: null }} onRetry={jest.fn()} />);
    expect(screen.getByText('Cash')).toBeTruthy();
    expect(screen.getByText('$1,500.00')).toBeTruthy();
  });

  it('excludes archived accounts', async () => {
    const archived = { ...acct, id: 'a2', name: 'Old', isArchived: true };
    await render(
      <AccountCarousel state={{ data: [archived], loading: false, error: null }} onRetry={jest.fn()} />,
    );
    expect(screen.getByText('No accounts yet.')).toBeTruthy();
  });

  it('renders error with retry', async () => {
    await render(<AccountCarousel state={{ data: null, loading: false, error: 'x' }} onRetry={jest.fn()} />);
    expect(screen.getByTestId('section-retry')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/dashboard/account-carousel.test.tsx`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/mobile/src/components/dashboard/account-carousel.tsx
import { ScrollView, Text, View } from 'react-native';
import { money } from '@finby/core';
import type { AccountView } from '@finby/shared';
import { SectionCard, SectionLoading, SectionError, SectionEmpty, type SectionProps } from './section-card';

function AccountCard({ a }: { a: AccountView }) {
  return (
    <View className="w-40 gap-2 rounded-xl border border-line bg-surface-2 p-3">
      <View className="flex-row items-center gap-2">
        <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: a.color ?? '#1d6ef5' }} />
        <Text className="flex-1 text-sm font-medium text-ink" numberOfLines={1}>
          {a.name}
        </Text>
      </View>
      <Text className="text-lg font-semibold text-ink">{money(a.balance, a.currency)}</Text>
      <Text className="text-xs uppercase tracking-wide text-muted">{a.accountType}</Text>
    </View>
  );
}

export function AccountCarousel({ state, onRetry }: SectionProps<AccountView[]>) {
  const accounts = state.data?.filter((a) => !a.isArchived) ?? [];
  return (
    <SectionCard title="Accounts">
      {state.loading ? (
        <SectionLoading />
      ) : state.error || !state.data ? (
        <SectionError onRetry={onRetry} />
      ) : accounts.length === 0 ? (
        <SectionEmpty message="No accounts yet." />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3">
          {accounts.map((a) => (
            <AccountCard key={a.id} a={a} />
          ))}
        </ScrollView>
      )}
    </SectionCard>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/dashboard/account-carousel.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/dashboard/account-carousel.tsx apps/mobile/src/components/dashboard/account-carousel.test.tsx
git commit -m "feat(mobile): dashboard account-carousel section"
```

---

### Task 8: RecentTransactions section

**Files:**
- Create: `apps/mobile/src/components/dashboard/recent-transactions.tsx`
- Test: `apps/mobile/src/components/dashboard/recent-transactions.test.tsx`

**Interfaces:**
- Consumes: `SectionProps<Transaction[]>`; `money` + `shortDate` from `@finby/core`; `Transaction` from `@finby/shared`.
- Produces: `RecentTransactions({ state, onRetry }: SectionProps<Transaction[]>)` — read-only rows (label = `merchant ?? description ?? category?.name ?? 'Transaction'`, date via `shortDate`, amount `money(amountBase, currencyBase)` with `+` (success) for `INCOME` else `−`). Empty → "No transactions yet."

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/dashboard/recent-transactions.test.tsx
import { render, screen } from '@testing-library/react-native';
import type { Transaction } from '@finby/shared';
import { RecentTransactions } from './recent-transactions';

const tx: Transaction = {
  id: 't1',
  type: 'EXPENSE',
  status: 'CONFIRMED',
  amountOriginal: '20.00',
  currencyOriginal: 'USD',
  amountBase: '20.00',
  currencyBase: 'USD',
  fxRateUsed: '1',
  merchant: 'Coffee Shop',
  description: null,
  category: { id: 'c1', name: 'Food' },
  account: { id: 'a1', name: 'Cash' },
  transactionDate: '2026-06-20T10:00:00.000Z',
  tags: [],
  aiConfidence: null,
  loggedByUserId: 'u1',
  createdAt: '2026-06-20T10:00:00.000Z',
};

describe('RecentTransactions', () => {
  it('renders a transaction row', async () => {
    await render(<RecentTransactions state={{ data: [tx], loading: false, error: null }} onRetry={jest.fn()} />);
    expect(screen.getByText('Coffee Shop')).toBeTruthy();
    expect(screen.getByText('−$20.00')).toBeTruthy();
  });

  it('renders empty state', async () => {
    await render(<RecentTransactions state={{ data: [], loading: false, error: null }} onRetry={jest.fn()} />);
    expect(screen.getByText('No transactions yet.')).toBeTruthy();
  });

  it('renders error with retry', async () => {
    await render(<RecentTransactions state={{ data: null, loading: false, error: 'x' }} onRetry={jest.fn()} />);
    expect(screen.getByTestId('section-retry')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/dashboard/recent-transactions.test.tsx`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/mobile/src/components/dashboard/recent-transactions.tsx
import { Text, View } from 'react-native';
import { money, shortDate } from '@finby/core';
import type { Transaction } from '@finby/shared';
import { SectionCard, SectionLoading, SectionError, SectionEmpty, type SectionProps } from './section-card';

function txLabel(t: Transaction): string {
  return t.merchant ?? t.description ?? t.category?.name ?? 'Transaction';
}

function TxRow({ t }: { t: Transaction }) {
  const income = t.type === 'INCOME';
  const sign = income ? '+' : '−';
  return (
    <View className="flex-row items-center justify-between gap-3">
      <View className="flex-1">
        <Text className="text-sm font-medium text-ink" numberOfLines={1}>
          {txLabel(t)}
        </Text>
        <Text className="text-xs text-muted">{shortDate(t.transactionDate)}</Text>
      </View>
      <Text className={`text-sm font-semibold ${income ? 'text-success' : 'text-ink'}`}>
        {sign}
        {money(t.amountBase, t.currencyBase)}
      </Text>
    </View>
  );
}

export function RecentTransactions({ state, onRetry }: SectionProps<Transaction[]>) {
  return (
    <SectionCard title="Recent transactions">
      {state.loading ? (
        <SectionLoading />
      ) : state.error || !state.data ? (
        <SectionError onRetry={onRetry} />
      ) : state.data.length === 0 ? (
        <SectionEmpty message="No transactions yet." />
      ) : (
        <View className="gap-3">
          {state.data.map((t) => (
            <TxRow key={t.id} t={t} />
          ))}
        </View>
      )}
    </SectionCard>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/dashboard/recent-transactions.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/dashboard/recent-transactions.tsx apps/mobile/src/components/dashboard/recent-transactions.test.tsx
git commit -m "feat(mobile): dashboard recent-transactions section"
```

---

### Task 9: DashboardScreen + route

**Files:**
- Create: `apps/mobile/src/screens/dashboard-screen.tsx`
- Create: `apps/mobile/app/(app)/dashboard.tsx`
- Test: `apps/mobile/src/screens/dashboard-screen.test.tsx`

**Interfaces:**
- Consumes: `useAuthStore` (`user: ApiUser | null`, `workspace`); `api.dashboard.{getSummary,listBudgets,listAccounts,listRecentTransactions}` from `runtime.native`; `currentMonthRange` from `@finby/core`; all section components (Tasks 3–8).
- Produces: `DashboardScreen()` — orchestrates four independent `SectionState`s, pull-to-refresh, header (title + StreakBadge). The route file re-exports it as `default`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/screens/dashboard-screen.test.tsx
import { render, screen, waitFor } from '@testing-library/react-native';

const authState = { workspace: { id: 'w1' }, user: { displayName: 'Tee', currentStreak: 3 } };
jest.mock('../lib/use-auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector(authState),
}));

jest.mock('../lib/runtime.native', () => ({
  api: {
    dashboard: {
      getSummary: jest.fn(),
      listBudgets: jest.fn(),
      listAccounts: jest.fn(),
      listRecentTransactions: jest.fn(),
    },
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => require('react').createElement('Text', null, name),
}));

import { api } from '../lib/runtime.native';
import { DashboardScreen } from './dashboard-screen';

const dash = api.dashboard as unknown as {
  getSummary: jest.Mock;
  listBudgets: jest.Mock;
  listAccounts: jest.Mock;
  listRecentTransactions: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  dash.getSummary.mockResolvedValue({
    period: { from: '2026-06-01', to: '2026-06-25' },
    totalIncome: '5000.00', totalExpenses: '1200.00', netSavings: '3800.00',
    savingsRate: 76, currency: 'USD', transactionCount: 12,
  });
  dash.listBudgets.mockResolvedValue([]);
  dash.listAccounts.mockResolvedValue([]);
  dash.listRecentTransactions.mockResolvedValue([]);
});

describe('DashboardScreen', () => {
  it('renders the header with the streak count', async () => {
    await render(<DashboardScreen />);
    expect(screen.getByText('Dashboard')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('3')).toBeTruthy());
  });

  it('paints summary data and isolates a failing section', async () => {
    dash.listBudgets.mockRejectedValue(new Error('boom'));
    await render(<DashboardScreen />);
    // Summary still paints…
    await waitFor(() => expect(screen.getByText('$5,000.00')).toBeTruthy());
    // …and the failed budgets section shows its retry without blanking others.
    await waitFor(() => expect(screen.getByTestId('section-retry')).toBeTruthy());
  });

  it('fetches each section once on mount', async () => {
    await render(<DashboardScreen />);
    await waitFor(() => expect(dash.getSummary).toHaveBeenCalledTimes(1));
    expect(dash.listBudgets).toHaveBeenCalledTimes(1);
    expect(dash.listAccounts).toHaveBeenCalledTimes(1);
    expect(dash.listRecentTransactions).toHaveBeenCalledWith('w1', 10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/screens/dashboard-screen.test.tsx`
Expected: FAIL — cannot find module `./dashboard-screen`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/mobile/src/screens/dashboard-screen.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, currentMonthRange } from '@finby/core';
import type { AccountView, BudgetView, SummaryResult, Transaction } from '@finby/shared';
import { useAuthStore } from '../lib/use-auth-store';
import { api } from '../lib/runtime.native';
import type { SectionState } from '../components/dashboard/section-card';
import { MonthSummary } from '../components/dashboard/month-summary';
import { BudgetList } from '../components/dashboard/budget-list';
import { AccountCarousel } from '../components/dashboard/account-carousel';
import { RecentTransactions } from '../components/dashboard/recent-transactions';
import { StreakBadge } from '../components/dashboard/streak-badge';

const LOADING = { data: null, loading: true, error: null } as const;

function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Could not load this section.';
}

export function DashboardScreen() {
  const workspace = useAuthStore((s) => s.workspace);
  const user = useAuthStore((s) => s.user);

  const [summary, setSummary] = useState<SectionState<SummaryResult>>(LOADING);
  const [budgets, setBudgets] = useState<SectionState<BudgetView[]>>(LOADING);
  const [accounts, setAccounts] = useState<SectionState<AccountView[]>>(LOADING);
  const [recent, setRecent] = useState<SectionState<Transaction[]>>(LOADING);
  const [refreshing, setRefreshing] = useState(false);

  const loadSummary = useCallback(() => {
    if (!workspace) return Promise.resolve();
    const { from, to } = currentMonthRange();
    setSummary(LOADING);
    return api.dashboard
      .getSummary(workspace.id, from, to)
      .then((d) => setSummary({ data: d, loading: false, error: null }))
      .catch((e) => setSummary({ data: null, loading: false, error: errMsg(e) }));
  }, [workspace]);

  const loadBudgets = useCallback(() => {
    if (!workspace) return Promise.resolve();
    setBudgets(LOADING);
    return api.dashboard
      .listBudgets(workspace.id)
      .then((d) => setBudgets({ data: d, loading: false, error: null }))
      .catch((e) => setBudgets({ data: null, loading: false, error: errMsg(e) }));
  }, [workspace]);

  const loadAccounts = useCallback(() => {
    if (!workspace) return Promise.resolve();
    setAccounts(LOADING);
    return api.dashboard
      .listAccounts(workspace.id)
      .then((d) => setAccounts({ data: d, loading: false, error: null }))
      .catch((e) => setAccounts({ data: null, loading: false, error: errMsg(e) }));
  }, [workspace]);

  const loadRecent = useCallback(() => {
    if (!workspace) return Promise.resolve();
    setRecent(LOADING);
    return api.dashboard
      .listRecentTransactions(workspace.id, 10)
      .then((d) => setRecent({ data: d, loading: false, error: null }))
      .catch((e) => setRecent({ data: null, loading: false, error: errMsg(e) }));
  }, [workspace]);

  const initialized = useRef(false);
  useEffect(() => {
    if (!workspace || initialized.current) return;
    initialized.current = true;
    void loadSummary();
    void loadBudgets();
    void loadAccounts();
    void loadRecent();
  }, [workspace, loadSummary, loadBudgets, loadAccounts, loadRecent]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadSummary(), loadBudgets(), loadAccounts(), loadRecent()]);
    setRefreshing(false);
  }, [loadSummary, loadBudgets, loadAccounts, loadRecent]);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <ScrollView
        contentContainerClassName="gap-5 px-4 py-5"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8da3c0" />
        }
      >
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-bold text-ink">Dashboard</Text>
          <StreakBadge streak={user?.currentStreak ?? 0} />
        </View>
        <MonthSummary state={summary} onRetry={loadSummary} />
        <BudgetList state={budgets} onRetry={loadBudgets} />
        <AccountCarousel state={accounts} onRetry={loadAccounts} />
        <RecentTransactions state={recent} onRetry={loadRecent} />
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/screens/dashboard-screen.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Create the route wrapper**

```tsx
// apps/mobile/app/(app)/dashboard.tsx
export { DashboardScreen as default } from '../../src/screens/dashboard-screen';
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens/dashboard-screen.tsx apps/mobile/src/screens/dashboard-screen.test.tsx apps/mobile/app/\(app\)/dashboard.tsx
git commit -m "feat(mobile): dashboard screen (parallel section fetch + pull-to-refresh)"
```

---

### Task 10: Wire the Tabs navigator

**Files:**
- Create: `apps/mobile/src/components/nav/tabs-config.ts`
- Test: `apps/mobile/src/components/nav/tabs-config.test.ts`
- Create: `apps/mobile/app/(app)/transactions.tsx`
- Modify: `apps/mobile/app/(app)/_layout.tsx` (Stack → Tabs)
- Modify: `apps/mobile/src/screens/chat-screen.tsx` (remove the settings gear)

**Interfaces:**
- Consumes: `TabBarIcon` (Task 1); `TransactionsPlaceholderScreen` (Task 2); `DashboardScreen` route (Task 9); existing `ChatScreen`/`SettingsScreen` routes.
- Produces: `TABS` — the ordered tab config consumed by `_layout`.

- [ ] **Step 1: Write the failing test (tab config)**

```ts
// apps/mobile/src/components/nav/tabs-config.test.ts
import { TABS } from './tabs-config';

describe('TABS', () => {
  it('defines the four tabs in order', () => {
    expect(TABS.map((t) => t.name)).toEqual(['index', 'dashboard', 'transactions', 'settings']);
  });

  it('each tab has an outline and a filled icon', () => {
    for (const t of TABS) {
      expect(typeof t.outline).toBe('string');
      expect(typeof t.filled).toBe('string');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/nav/tabs-config.test.ts`
Expected: FAIL — cannot find module `./tabs-config`. (Note: this is a `.ts` logic test → Vitest, not jest.)

- [ ] **Step 3: Write the tab config**

```ts
// apps/mobile/src/components/nav/tabs-config.ts
import type { Ionicons } from '@expo/vector-icons';

type Glyph = keyof typeof Ionicons.glyphMap;

export interface TabDef {
  name: 'index' | 'dashboard' | 'transactions' | 'settings';
  outline: Glyph;
  filled: Glyph;
}

/** Ordered bottom-tab definitions (mirrors web app-nav: Chat/Dashboard/Txns/Settings). */
export const TABS: readonly TabDef[] = [
  { name: 'index', outline: 'chatbubble-ellipses-outline', filled: 'chatbubble-ellipses' },
  { name: 'dashboard', outline: 'grid-outline', filled: 'grid' },
  { name: 'transactions', outline: 'receipt-outline', filled: 'receipt' },
  { name: 'settings', outline: 'settings-outline', filled: 'settings' },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/nav/tabs-config.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Create the transactions route wrapper**

```tsx
// apps/mobile/app/(app)/transactions.tsx
export { TransactionsPlaceholderScreen as default } from '../../src/screens/transactions-placeholder-screen';
```

- [ ] **Step 6: Convert `_layout` from Stack to Tabs**

Replace the entire contents of `apps/mobile/app/(app)/_layout.tsx` with:

```tsx
// apps/mobile/app/(app)/_layout.tsx
import { Tabs } from 'expo-router';
import { AppLockGate } from '../../src/components/auth/app-lock-gate';
import { TabBarIcon } from '../../src/components/nav/tab-bar-icon';
import { TABS } from '../../src/components/nav/tabs-config';

export default function AppLayout() {
  return (
    <AppLockGate>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarActiveTintColor: '#1d6ef5',
          tabBarInactiveTintColor: '#8da3c0',
          tabBarStyle: { backgroundColor: '#0b1626', borderTopColor: '#1c2c46' },
        }}
      >
        {TABS.map((t) => (
          <Tabs.Screen
            key={t.name}
            name={t.name}
            options={{
              tabBarIcon: ({ focused, color, size }) => (
                <TabBarIcon
                  outline={t.outline}
                  filled={t.filled}
                  focused={focused}
                  color={color}
                  size={size}
                />
              ),
            }}
          />
        ))}
      </Tabs>
    </AppLockGate>
  );
}
```

- [ ] **Step 7: Remove the settings gear from the chat header**

In `apps/mobile/src/screens/chat-screen.tsx`, the header currently renders a "New chat" button and a settings gear `Pressable` (the one calling `router.push('/settings')`). Delete the gear `Pressable` so only "New chat" remains:

```tsx
        <View className="flex-row items-center gap-4">
          <Pressable onPress={() => void newChat()} accessibilityRole="button" accessibilityLabel="New chat" hitSlop={8}>
            <Text className="text-sm font-medium text-accent">New chat</Text>
          </Pressable>
        </View>
```

Then remove the now-unused `useRouter`/`router` if nothing else in the file uses them (check: `grep -n "router" src/screens/chat-screen.tsx`). If `router` has no other use, delete the `const router = useRouter();` line and the `useRouter` import; otherwise leave them.

- [ ] **Step 8: Regenerate typed routes, then typecheck**

Run (writes `.expo/types/router.d.ts` for the new `dashboard`/`transactions` routes, then exits):
```bash
EXPO_NO_TELEMETRY=1 CI=1 npx expo start --port 8099
```
Then:
```bash
npx tsc --noEmit
```
Expected: tsc exits 0. If it errors that `/dashboard` or `/settings` hrefs aren't valid `Href`, the typegen didn't run — re-run the `expo start` line above.

- [ ] **Step 9: Run the chat-screen test (guard against the gear removal regressing it)**

Run: `npx jest src/screens/chat-screen.test.tsx`
Expected: PASS. If a test asserted on the settings gear / `mockPush` to `/settings`, update it to reflect that Settings is now a tab (remove that assertion).

- [ ] **Step 10: Commit**

```bash
git add apps/mobile/src/components/nav/tabs-config.ts apps/mobile/src/components/nav/tabs-config.test.ts apps/mobile/app/\(app\)/transactions.tsx apps/mobile/app/\(app\)/_layout.tsx apps/mobile/src/screens/chat-screen.tsx
git commit -m "feat(mobile): bottom-tab navigator (Chat/Dashboard/Transactions/Settings)"
```

---

### Task 11: Full gate + bundle sanity

**Files:** none (verification only).

- [ ] **Step 1: Run the full mobile suite**

Run (from `apps/mobile`): `pnpm test`
Expected: all vitest + jest suites pass (existing 59 + the new section/screen/nav tests).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0. (If route-href errors: re-run the Task 10 Step 8 typegen.)

- [ ] **Step 3: Lint (whole repo)**

Run (from repo root): `pnpm lint`
Expected: 0 errors (the pre-existing `apps/web/public/sw.js` `_e` warning is acceptable). If a nested `.claude/worktrees/` worktree exists, remove it first (it makes `eslint .` descend into web's `sw.js` and false-fail).

- [ ] **Step 4: Headless bundle sanity (no device needed)**

Run (from `apps/mobile`):
```bash
EXPO_NO_TELEMETRY=1 npx expo export:embed --platform ios --dev false --bundle-output /tmp/finby-p5.js
grep -c 'SharedArrayBuffer.prototype' /tmp/finby-p5.js
```
Expected: bundle writes successfully; the grep prints `0`.

- [ ] **Step 5: Commit (only if anything changed, e.g. a chat-screen test tweak)**

```bash
git add -A apps/mobile
git commit -m "test(mobile): green gate for tabs + dashboard"
```
(If nothing changed, skip.)

- [ ] **Step 6: Device verification handoff (manual, user)**

Tabs/navigation runtime and pull-to-refresh are best verified on device in Expo Go: `pnpm --filter finby-mobile start`. Confirm: four-tab bar shows, active tab is the filled accent icon on a pill, Chat is the default, Dashboard loads its four sections (or shows per-section retry on failure), pull-to-refresh works, Transactions shows the placeholder, Settings opens in-tab.

---

## Spec Coverage Check

- Tab shell (Stack→Tabs, 4 tabs, Chat default, lock still wraps) → Tasks 1, 10.
- Instagram-style icons-only bar (filled+pill active, outline inactive, exact Ionicons) → Tasks 1, 10.
- Chat header gear removal → Task 10 Step 7.
- Transactions "Coming soon" placeholder → Tasks 2, 10.
- Dashboard header (title + read-only streak badge) → Tasks 4, 9.
- Four independent parallel section fetches via `api.dashboard.*` + per-section retry → Task 9.
- MonthSummary / Budgets / Accounts carousel / Recent transactions, exact shapes + `money`/`shortDate` → Tasks 5–8.
- Per-section loading/error/empty → Task 3 (+ each section).
- Pull-to-refresh → Task 9.
- Testing (sections, screen isolation, tab config, placeholder) → Tasks 1–10; gate → Task 11.
- typedRoutes regen + settings-as-tab + bundle sanity risks → Task 10 Step 8, Task 11.
