# Dashboard Loading & Polish

**Date:** 2026-07-02
**Status:** Approved design (pending spec review)
**Area:** `apps/mobile` (skeleton primitive, per-section skeletons, dashboard loaders), `apps/api` (analytics type dedup)

## Summary

Replace the dashboard's uniform loading spinner with **shaped, glowing skeleton placeholders**
on the structured sections (so the page keeps its layout while loading), keep the spinner for the
two SVG charts, and fold in two tracked refactors: **per-section retry granularity** and
**analytics type de-duplication**. Mobile-only; no new dependencies.

## Goals

- On mount / pull-to-refresh, the structured sections shimmer into their real shape instead of
  showing a bare centered spinner.
- Retrying one failed section reloads *only* that section (no sibling flashing).
- The API stops redefining analytics result types that already live in `@finby/shared`.

## Non-goals (out of scope)

- Skeletoning the donut / trend charts (they keep the spinner — a shaped skeleton for a
  pie/spline is awkward and low-value).
- Web parity (web is in maintenance).
- A gradient "sweep" shimmer (we use a simpler opacity pulse — the "glow" the user asked for).

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Skeleton style | Opacity **pulse (glow)** via RN `Animated`; static under reduced-motion |
| Which sections skeleton | Money cards, Accounts, Budgets, Insight |
| Which sections keep spinner | Spending donut, 6-month trend (charts) |
| Retry | Per-endpoint loaders; each section's retry reloads only itself |
| Type dedup | API re-exports shared result types; keeps API-only (NetWorth/TopMerchants) local |

## Architecture

### 1. `Skeleton` primitive — `apps/mobile/src/components/ui/skeleton.tsx`

`<Skeleton className?: string; style?: ViewStyle />` — a rounded block (muted surface color)
whose opacity loops ~0.4↔1 via `Animated.loop(Animated.sequence(...))` with
`useNativeDriver: true`. On mount it checks `AccessibilityInfo.isReduceMotionEnabled()`; when
true it renders **static** (fixed ~0.6 opacity, no animation). The block is decorative; section
skeleton groups carry an `accessibilityLabel="Loading"`. Cleans up the animation on unmount.

### 2. Per-section skeletons

Each of these renders a shaped skeleton in its `state.loading` branch (instead of
`<SectionLoading />`), composed from `<Skeleton>`:

- **`MonthSummary`** → a 2×2 grid of tile skeletons matching the stat tiles.
- **`AccountCarousel`** → one balance-card-shaped skeleton block + the existing pagination dots.
- **`BudgetList`** → 2–3 row skeletons (a small circle + a bar) matching a budget row.
- **`InsightCard`** → two stacked text-line skeletons in the card container.

The **`SpendingDonut`** and **`SpendTrend`** loading branches are unchanged (`<SectionLoading />`).

### 3. Section-retry granularity (dashboard-screen.tsx)

Replace the coarse `loadMonth` / `loadStatic` grouping with **per-endpoint loaders**, each of
which sets only its own section state to `LOADING` and fetches only its endpoint:

- `loadSummary(m)`, `loadDonut(m)`, `loadInsight(m)`, `loadBudgets(m)` (month-scoped)
- `loadAccounts()`, `loadTrend()` (static)

`loadMonth(m)` becomes a thin wrapper that calls the four month-scoped loaders (used by mount,
month-change, and pull-to-refresh). Each section's `onRetry` targets **its own** loader (e.g.
`SpendingDonut onRetry={() => loadDonut(month)}`). Pull-to-refresh calls all six. The mount
`initialized` ref guard is preserved; no double-fetch.

### 4. Analytics type dedup (analytics.types.ts)

`apps/api/src/modules/analytics/analytics.types.ts` re-exports the result types that already
exist in `@finby/shared` instead of redefining them:

```ts
export type {
  SummaryResult,
  CategoryBreakdownItem,
  CategoryBreakdownResult,
  TrendPoint,
  TrendResult,
} from '@finby/shared';
```

The API-only types (`NetWorthResult`, `TopMerchantItem`, `TopMerchantsResult`) stay defined
locally. The service/controller imports are unchanged (same names). The shapes are already
structurally identical (verified in Project A), so this is a no-behavior-change consolidation
that makes drift impossible.

## Data flow (loading)

```
mount / pull-refresh / month-change → loadMonth(m) → loadSummary/loadDonut/loadInsight/loadBudgets
                                    → loadAccounts / loadTrend (static; mount + refresh only)
each section: state.loading → shaped skeleton (structured) | spinner (charts)
section onRetry → its own loader only (no siblings re-blanked)
```

## Error handling / edge cases

- Each section keeps its own loading/error/empty state; a per-endpoint retry never touches
  siblings.
- Reduced-motion users get a static skeleton (no pulse), still conveying "loading".
- Skeleton animation is cancelled on unmount (no leaked `Animated.loop`).
- Type re-export must not change any emitted shape — the API build (nest/tsc) is the guard.

## Testing

- **Skeleton primitive:** renders a block; under mocked `AccessibilityInfo.isReduceMotionEnabled
  → true` it renders without starting the loop (static).
- **Each section:** renders its skeleton when `state.loading` and its real content otherwise
  (e.g. `MonthSummary` loading → skeleton tiles, not the spinner; donut loading → spinner).
- **Dashboard retry:** `SpendingDonut`'s retry calls `getByCategory` again but NOT
  `getSummary`/`getInsight`/`listBudgets`; month-change still calls all four.
- **API:** `pnpm --filter finby-api build` succeeds after the re-export; analytics/insight tests
  green (shapes unchanged).
- `pnpm test` / `pnpm lint` / mobile `typecheck` green before merge.

## Follow-ups (not this iteration)

- Skeleton the charts (shimmer ring / block) if the spinner ever feels inconsistent.
- Gradient-sweep shimmer variant.
