# Dashboard Loading & Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shaped glowing skeletons for the structured dashboard sections, per-section retry granularity, and analytics type de-duplication.

**Architecture:** A reusable `Skeleton` primitive (RN `Animated` opacity pulse, static under reduced motion) composed into per-section skeleton layouts; the dashboard's loaders split per-endpoint so each section retries alone; the API re-exports shared analytics result types.

**Tech Stack:** React Native + Expo, NativeWind, RN `Animated`/`AccessibilityInfo` (no new deps); Jest + RNTL (mobile); NestJS (API).

## Global Constraints

- Package manager **pnpm** (v10, turbo). Filters: `finby-mobile`, `finby-api`. No AI-attribution trailers.
- Build `@finby/core` + `@finby/shared` before mobile `typecheck` (`pnpm --filter` bypasses turbo `^build`).
- `noUncheckedIndexedAccess: true`. Mobile components: Jest + RNTL v14.
- Skeleton = **opacity pulse** (~0.4↔1, `useNativeDriver: true`); **static** when `AccessibilityInfo.isReduceMotionEnabled()` is true; decorative (`accessibilityElementsHidden`); animation stopped on unmount.
- Charts (`SpendingDonut`, `SpendTrend`) keep the existing `<SectionLoading />` spinner. Only money-cards / accounts / budgets / insight get skeletons.
- No new dependencies; mobile-only except the API type re-export.

---

### Task 1: `Skeleton` primitive

**Files:**
- Create: `apps/mobile/src/components/ui/skeleton.tsx`
- Test: `apps/mobile/src/components/ui/skeleton.test.tsx`

**Interfaces:**
- Produces: `Skeleton({ style?: ViewStyle })` — a glowing rounded block; size comes from `style`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/components/ui/skeleton.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { Skeleton } from './skeleton';

describe('Skeleton', () => {
  it('renders a block', async () => {
    await render(<Skeleton style={{ width: 40, height: 12 }} />);
    expect(screen.getByTestId('skeleton', { includeHiddenElements: true })).toBeTruthy();
  });

  it('renders (static) when reduced motion is enabled', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    await render(<Skeleton style={{ width: 40, height: 12 }} />);
    expect(screen.getByTestId('skeleton', { includeHiddenElements: true })).toBeTruthy();
    jest.restoreAllMocks();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-mobile test:components -- skeleton`
Expected: FAIL — cannot resolve `./skeleton`.

- [ ] **Step 3: Implement**

Create `apps/mobile/src/components/ui/skeleton.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, type ViewStyle } from 'react-native';

const BASE: ViewStyle = { backgroundColor: '#16233a', borderRadius: 10 };

/** A glowing placeholder block. Pulses opacity 0.4↔1 (native driver); renders
 *  static when the user prefers reduced motion. Decorative — the section's
 *  skeleton group carries the "Loading" a11y label. Size comes from `style`. */
export function Skeleton({ style }: { style?: ViewStyle }) {
  const opacity = useRef(new Animated.Value(0.6)).current;
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let on = true;
    let loop: Animated.CompositeAnimation | undefined;
    void AccessibilityInfo.isReduceMotionEnabled().then((rm) => {
      if (!on) return;
      if (rm) {
        setReduce(true);
        opacity.setValue(0.6);
        return;
      }
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => {
      on = false;
      loop?.stop();
    };
  }, [opacity]);

  return (
    <Animated.View
      testID="skeleton"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[BASE, { opacity: reduce ? 0.6 : opacity }, style]}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-mobile test:components -- skeleton` → PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/ui/skeleton.tsx apps/mobile/src/components/ui/skeleton.test.tsx
git commit -m "feat(mobile): glowing Skeleton primitive (reduced-motion aware)"
```

---

### Task 2: Shaped skeletons for the four structured sections

**Files:**
- Modify: `apps/mobile/src/components/dashboard/month-summary.tsx` (loading branch)
- Modify: `apps/mobile/src/components/dashboard/account-carousel.tsx` (loading branch)
- Modify: `apps/mobile/src/components/dashboard/budget-list.tsx` (loading branch)
- Modify: `apps/mobile/src/components/dashboard/insight-card.tsx` (loading branch)
- Test: the four corresponding `*.test.tsx`

**Interfaces:**
- Consumes: `Skeleton` (Task 1).
- Produces: each section renders a shaped skeleton (not `SectionLoading`) when `state.loading`.

- [ ] **Step 1: Write the failing tests**

For each of the four test files, add a "renders a skeleton (not the spinner) while loading" test. The skeleton has `testID="skeleton"`; the spinner has `testID="section-loading"`. Add (adapt import/render to each file):

```tsx
  it('shows a skeleton, not the spinner, while loading', async () => {
    await render(<MonthSummary state={{ data: null, loading: true, error: null }} onRetry={() => {}} />);
    expect(screen.getAllByTestId('skeleton', { includeHiddenElements: true }).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('section-loading')).toBeNull();
  });
```

(Use `AccountCarousel` / `BudgetList` / `InsightCard` with the same loading state in their files. `InsightCard` returns early on loading — same assertion applies.)

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter finby-mobile test:components -- month-summary account-carousel budget-list insight-card`
Expected: FAIL — sections still render `section-loading`, no `skeleton`.

- [ ] **Step 3: Replace each loading branch with a shaped skeleton**

`month-summary.tsx` — add `import { Skeleton } from '../ui/skeleton';`, and replace `<SectionLoading />` with:

```tsx
        <View className="gap-3" accessible accessibilityLabel="Loading">
          <View className="flex-row gap-3">
            <Skeleton style={{ flex: 1, height: 64 }} />
            <Skeleton style={{ flex: 1, height: 64 }} />
          </View>
          <View className="flex-row gap-3">
            <Skeleton style={{ flex: 1, height: 64 }} />
            <Skeleton style={{ flex: 1, height: 64 }} />
          </View>
        </View>
```

`account-carousel.tsx` — add the import, replace `<SectionLoading />` with:

```tsx
        <View accessible accessibilityLabel="Loading">
          <Skeleton style={{ height: 132, borderRadius: 16 }} />
        </View>
```

`budget-list.tsx` — add the import, replace `<SectionLoading />` with:

```tsx
        <View className="gap-4" accessible accessibilityLabel="Loading">
          {[0, 1, 2].map((i) => (
            <View key={i} className="gap-1.5">
              <View className="flex-row items-center gap-2">
                <Skeleton style={{ width: 32, height: 32 }} />
                <Skeleton style={{ flex: 1, height: 14 }} />
              </View>
              <Skeleton style={{ height: 8, borderRadius: 999 }} />
            </View>
          ))}
        </View>
```

`insight-card.tsx` — add the import, and change the loading early-return
`if (state.loading) return <SectionLoading />;` to:

```tsx
  if (state.loading) {
    return (
      <View className="gap-2 rounded-2xl border border-line bg-surface p-4" accessible accessibilityLabel="Loading">
        <Skeleton style={{ height: 14, width: '90%' }} />
        <Skeleton style={{ height: 14, width: '60%' }} />
      </View>
    );
  }
```

(Remove the now-unused `SectionLoading` import from any of these files where it's no longer referenced — check each; `month-summary`/`account-carousel`/`budget-list` may still import it only here, so drop it if unused. `insight-card` imports `SectionLoading` — drop it if unused after this change. Leave `SectionError`/`SectionEmpty` imports intact.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter finby-mobile test:components -- month-summary account-carousel budget-list insight-card` → PASS.
Run: `pnpm --filter @finby/core build && pnpm --filter @finby/shared build && pnpm --filter finby-mobile typecheck` → zero new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/dashboard/month-summary.tsx apps/mobile/src/components/dashboard/account-carousel.tsx apps/mobile/src/components/dashboard/budget-list.tsx apps/mobile/src/components/dashboard/insight-card.tsx apps/mobile/src/components/dashboard/month-summary.test.tsx apps/mobile/src/components/dashboard/account-carousel.test.tsx apps/mobile/src/components/dashboard/budget-list.test.tsx apps/mobile/src/components/dashboard/insight-card.test.tsx
git commit -m "feat(mobile): shaped skeleton loading for the structured dashboard sections"
```

---

### Task 3: Per-section retry granularity (dashboard-screen)

**Files:**
- Modify: `apps/mobile/src/screens/dashboard-screen.tsx`
- Test: `apps/mobile/src/screens/dashboard-screen.test.tsx`

**Interfaces:**
- Consumes: `api.dashboard.*` (unchanged).
- Produces: six per-endpoint loaders; each section's `onRetry` reloads only its own endpoint.

- [ ] **Step 1: Write the failing test**

In `dashboard-screen.test.tsx`, add a test proving a single section's retry doesn't reload siblings. Mock `getByCategory` to reject once (donut errors) while the others resolve, then press the donut's Retry (read the file's existing mock setup and adapt):

```tsx
  it('retrying one section reloads only that endpoint', async () => {
    (api.dashboard.getByCategory as jest.Mock).mockRejectedValueOnce(new Error('x'));
    await render(<DashboardScreen />);
    // donut is the only section in error → single Retry
    await fireEvent.press(await screen.findByText('Retry'));
    expect(api.dashboard.getByCategory).toHaveBeenCalledTimes(2); // initial + retry
    expect(api.dashboard.getSummary).toHaveBeenCalledTimes(1);    // NOT re-fetched
    expect(api.dashboard.getInsight).toHaveBeenCalledTimes(1);
    expect(api.dashboard.listBudgets).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-mobile test:components -- dashboard-screen`
Expected: FAIL — the retry currently calls `loadMonth`, so `getSummary`/`getInsight`/`listBudgets` are called twice.

- [ ] **Step 3: Split the loaders**

In `dashboard-screen.tsx`, replace the `loadMonth`/`loadStatic` `useCallback`s with six per-endpoint loaders + thin group wrappers:

```tsx
  const loadSummary = useCallback(
    (m: MonthRef) => {
      if (!workspace) return Promise.resolve();
      const { from, to } = monthToRange(m);
      setSummary(LOADING);
      return api.dashboard
        .getSummary(workspace.id, from, to)
        .then((d) => setSummary({ data: d, loading: false, error: null }))
        .catch((e) => setSummary({ data: null, loading: false, error: errMsg(e) }));
    },
    [workspace],
  );

  const loadDonut = useCallback(
    (m: MonthRef) => {
      if (!workspace) return Promise.resolve();
      const { from, to } = monthToRange(m);
      setDonut(LOADING);
      return api.dashboard
        .getByCategory(workspace.id, from, to, 'EXPENSE')
        .then((d) => setDonut({ data: d, loading: false, error: null }))
        .catch((e) => setDonut({ data: null, loading: false, error: errMsg(e) }));
    },
    [workspace],
  );

  const loadInsight = useCallback(
    (m: MonthRef) => {
      if (!workspace) return Promise.resolve();
      const { from, to } = monthToRange(m);
      setInsight(LOADING);
      return api.dashboard
        .getInsight(workspace.id, from, to)
        .then((d) => setInsight({ data: d, loading: false, error: null }))
        .catch((e) => setInsight({ data: null, loading: false, error: errMsg(e) }));
    },
    [workspace],
  );

  const loadBudgets = useCallback(
    (m: MonthRef) => {
      if (!workspace) return Promise.resolve();
      const { from } = monthToRange(m);
      setBudgets(LOADING);
      return api.dashboard
        .listBudgets(workspace.id, from)
        .then((d) => setBudgets({ data: d, loading: false, error: null }))
        .catch((e) => setBudgets({ data: null, loading: false, error: errMsg(e) }));
    },
    [workspace],
  );

  const loadAccounts = useCallback(() => {
    if (!workspace) return Promise.resolve();
    setAccounts(LOADING);
    return api.dashboard
      .listAccounts(workspace.id)
      .then((d) => setAccounts({ data: d, loading: false, error: null }))
      .catch((e) => setAccounts({ data: null, loading: false, error: errMsg(e) }));
  }, [workspace]);

  const loadTrend = useCallback(() => {
    if (!workspace) return Promise.resolve();
    setTrend(LOADING);
    return api.dashboard
      .getTrend(workspace.id)
      .then((d) => setTrend({ data: d, loading: false, error: null }))
      .catch((e) => setTrend({ data: null, loading: false, error: errMsg(e) }));
  }, [workspace]);

  const loadMonth = useCallback(
    (m: MonthRef) => Promise.all([loadSummary(m), loadDonut(m), loadInsight(m), loadBudgets(m)]),
    [loadSummary, loadDonut, loadInsight, loadBudgets],
  );

  const loadStatic = useCallback(
    () => Promise.all([loadAccounts(), loadTrend()]),
    [loadAccounts, loadTrend],
  );
```

Then point each section's `onRetry` at its own loader in the JSX:

```tsx
        <MonthSelector month={month} onChange={onSelectMonth} tier={tier} />
        <MonthSummary state={summary} onRetry={() => loadSummary(month)} />
        <AccountCarousel state={accounts} onRetry={loadAccounts} />
        <SpendingDonut state={donut} onRetry={() => loadDonut(month)} />
        <BudgetList state={budgets} onRetry={() => loadBudgets(month)} />
        <SpendTrend state={trend} onRetry={loadTrend} />
        <InsightCard state={insight} onRetry={() => loadInsight(month)} />
```

(The mount effect, `onSelectMonth`, and `onRefresh` still call `loadMonth`/`loadStatic` — unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-mobile test:components -- dashboard-screen` → PASS (existing + new).
Run: `pnpm --filter @finby/core build && pnpm --filter @finby/shared build && pnpm --filter finby-mobile typecheck` → zero errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/dashboard-screen.tsx apps/mobile/src/screens/dashboard-screen.test.tsx
git commit -m "feat(mobile): per-section dashboard retry (no sibling re-blanking)"
```

---

### Task 4: Analytics type de-duplication (API)

**Files:**
- Modify: `apps/api/src/modules/analytics/analytics.types.ts`

**Interfaces:**
- Consumes: `@finby/shared` result types.
- Produces: `analytics.types.ts` re-exports the shared types (same names) instead of redefining them.

- [ ] **Step 1: Re-export the shared result types**

Replace the local `SummaryResult`, `CategoryBreakdownItem`, `CategoryBreakdownResult`, `TrendPoint`, `TrendResult` interface definitions at the top of `apps/api/src/modules/analytics/analytics.types.ts` with a single re-export, keeping the API-only types below it:

```ts
export type {
  SummaryResult,
  CategoryBreakdownItem,
  CategoryBreakdownResult,
  TrendPoint,
  TrendResult,
} from '@finby/shared';

export interface TopMerchantItem {
  merchant: string;
  total: string;
  transactionCount: number;
}

export interface TopMerchantsResult {
  merchants: TopMerchantItem[];
  currency: string;
}

export interface NetWorthResult {
  cashTotal: string;
  portfolioTotal: string;
  netWorth: string;
  currency: string;
  snapshot: string;
}
```

- [ ] **Step 2: Verify the build (the shape guard) + tests**

Run: `pnpm --filter @finby/shared build && pnpm --filter finby-api build`
Expected: succeeds — the service/controller (which build `SummaryResult`/`CategoryBreakdownResult`/`TrendResult` objects) still typecheck against the now-shared types, proving the shapes are identical.
Run: `pnpm --filter finby-api test -- analytics.service insight.service`
Expected: PASS (behavior unchanged).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/analytics/analytics.types.ts
git commit -m "refactor(api): re-export shared analytics result types (kill duplication)"
```

- [ ] **Step 4: Full gate**

Run:
```bash
pnpm --filter @finby/core build
pnpm --filter @finby/shared build
pnpm --filter finby-mobile typecheck   # ZERO errors
pnpm --filter finby-mobile test        # vitest + jest
pnpm --filter finby-api test -- analytics insight
pnpm lint                              # 0 errors (pre-existing sw.js warning OK)
```
Expected: all pass. (`finby-mobile test` may show up to ~2 flaky-under-parallelism suites — `streak-sheet`, `edit-transaction-sheet` — that pass in isolation; re-run those two if they flake.)

---

## Self-Review

**Spec coverage:**
- `Skeleton` primitive (pulse, reduced-motion static, decorative) → Task 1. ✅
- Per-section skeletons (money cards, accounts, budgets, insight); charts keep spinner → Task 2. ✅
- Section-retry granularity (per-endpoint loaders; own-loader retry) → Task 3. ✅
- Analytics type dedup (re-export shared, keep NetWorth/TopMerchants) → Task 4. ✅
- Out of scope (charts skeleton, web, gradient sweep) → untouched. ✅

**Placeholder scan:** No TBD/TODO; every step has complete code. Test steps give the concrete assertion (skeleton present / spinner absent; retry call-counts; build guard).

**Type consistency:** `Skeleton({ style })` defined in Task 1, consumed in Task 2. The six loaders in Task 3 use the existing `api.dashboard` methods + `setX`/`SectionState` already in the file. Task 4 re-exports the exact names the service/controller already import (`SummaryResult`/`CategoryBreakdownResult`/`TrendResult`), so no call-site changes.
