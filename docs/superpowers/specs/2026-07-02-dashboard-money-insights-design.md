# Dashboard = "Money & Insights in One" — Project A

**Date:** 2026-07-02
**Status:** Approved design (pending spec review)
**Area:** `apps/api` (analytics: insight endpoint, by-category widening, tier caps), `packages/shared` + `packages/core` (contracts + month/tier helpers), `apps/mobile` (dashboard redesign + charts)

## Summary

Rebuild the mobile **Dashboard** into the single "money & insights in one" screen from the
mockup: a **month selector**, the existing 4 money cards, the accounts carousel, a **spending
donut**, budgets, and a **6-month trend line paired with an insight sentence**. Add **month
navigation** so users can view past months — the pain point that a Pro user "can't see past
months" is really that the dashboard has no month selector and is hardwired to
`currentMonthRange()`.

This is **Project A**, the follow-up to Project B (category visuals), which it consumes for the
donut legend. One spec; the implementation plan is phased **backend/contracts first, then
mobile**.

## Goals

- View any month's money summary + spending breakdown + insight, not just the current month.
- Make "unlimited history" a real Pro perk: Free reaches back 3 months (matching the existing
  90-day / 3-month caps), Pro/Premium unlimited — enforced server-side, gated in the UI.
- A server-computed, honest insight ("on pace to spend 12% less than last month; you'll save
  $1,940 in June") — no misleading partial-month comparisons.
- Two hand-built SVG charts (donut + trend) with pure, testable geometry and no charting
  dependency.
- Reuse existing dashboard sections (money cards, accounts, budgets) unchanged.

## Non-goals (deferred)

- **Web** dashboard parity (mobile-first; web is a later pass).
- Editing / adding transactions from the dashboard.
- **Budgets for past months** — budgets show only when viewing the current month.
- Chart interactivity (tooltips, scrubbing) — static charts in v1.
- A month selector that also scopes the trend — the trend is a trailing 6-month window,
  independent of the selected month.

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Composition | month selector · 4 money cards · accounts · donut · budgets · trend+insight |
| Removed section | Recent Transactions (it has its own tab) |
| Kept | Accounts carousel (belongs on a dashboard; month-independent balances) |
| Insight source | **New backend endpoint** (`analytics/insight`), structured fields + `message` |
| Insight semantics | **Pace/projection** for the current month; retrospective actual for past months |
| Month-nav reach | **Tier-gated**: Free 3 months back + upsell, Pro/Premium unlimited (server-enforced) |
| Charts | **Hand-built `react-native-svg`**, pure geometry helpers, no chart library |
| Trend line | Monthly **expenses** (coherent with the spend-focused donut + insight) |
| Insight styling | Client composes the styled sentence from structured fields; server `message` is a11y fallback |

## Architecture

### 1. Backend & contracts (phase 1)

**New `GET /workspaces/:id/analytics/insight?from&to` → `InsightResult`.** A new
`InsightService` (in the analytics module) reuses `AnalyticsService.summary` for the requested
period and the immediately preceding month.

```ts
interface InsightResult {
  period: { from: string; to: string };
  currency: string;
  direction: 'less' | 'more' | 'flat';   // current spend vs last month
  spendDeltaPercent: number;             // magnitude, >= 0; direction carries the sign
  projectionApplies: boolean;            // true only for the in-progress current month
  projectedSpend: string | null;         // month-end projection (current month only)
  projectedSavings: string | null;       // pace-based net-savings projection (current month only)
  comparedTo: { from: string; to: string }; // the prior-month window used
  message: string;                       // plain, ready-to-read sentence (a11y/fallback)
}
```

Logic:
- **Current (in-progress) month:** project month-end spend = `spendToDate / daysElapsed *
  daysInMonth`; `direction`/`spendDeltaPercent` compare `projectedSpend` to last month's actual
  expenses; `projectedSavings` = `netSavingsToDate / daysElapsed * daysInMonth`. Message: "You're
  on pace to spend 12% less than last month. At this rate you'll save $1,940 in June."
- **Past (complete) month:** `projectionApplies = false`; `direction`/`spendDeltaPercent` compare
  that month's actual expenses to the prior month's; `projectedSpend`/`projectedSavings` = null;
  message is retrospective ("You spent 12% less than the month before").
- **Edge cases:** no prior-month data → `direction: 'flat'`, message "Not enough history yet to
  compare."; last-month expenses zero → guard divide-by-zero (treat as `flat`/`more` sensibly);
  `daysElapsed` never zero.

The client composes the on-screen styled sentence (colored %, bold $) from the structured
fields; `message` is the plain fallback and a11y label.

**Widen `by-category`.** `CategoryBreakdownItem.category` `{id,name}` → `{id,name,icon,color}`
(Prisma select + `analytics.types.ts` + shared type), mirroring Project B, so the donut legend
resolves branded icons via `resolveCategoryVisual`. `by-category` already accepts `from`/`to`.

**Tier history cap.** New shared `analyticsHistoryMonths(tier)` (FREE = 3, PRO/PREMIUM/FAMILY =
`null`/unlimited, derived from `TIER_LIMITS`). A small guard rejects **FREE** `summary` /
`by-category` / `insight` requests whose `from` predates the cap with `403 tier_limit`
(consistent with existing tier errors). The client uses the same helper to disable stepping
past the boundary.

### 2. Shared / core contracts

- `packages/shared`: add `InsightResult`; widen `CategoryBreakdownItem.category`; add
  `analyticsHistoryMonths(tier)`.
- `packages/core`: month helpers `monthRange(year, monthIndex)`, `addMonths`,
  `formatMonthLabel`, `earliestSelectableMonth(tier)` (built on `analyticsHistoryMonths`);
  dashboard-api gains `getByCategory(ws, from, to, type?)`, `getTrend(ws, months?)`,
  `getInsight(ws, from, to)` (alongside existing `getSummary`).

### 3. Mobile (phase 2)

`DashboardScreen` gains `selectedMonth` state (defaults to the current month). Composition:
`MonthSelector · MonthSummary · AccountCarousel · SpendingDonut · BudgetList · SpendTrend +
InsightCard`. `MonthSummary`, `AccountCarousel`, `BudgetList` are reused unchanged;
`RecentTransactions` is removed from the screen.

Month scope:
- `selectedMonth` change → refetch `summary`, `by-category`, `insight` (each its own section
  state, independent paint, as today).
- `AccountCarousel` = live balances, always shown, month-independent.
- `BudgetList` shown **only** when `selectedMonth` is the current month.
- `SpendTrend` fetched once (trailing window), independent of `selectedMonth`.

New components:
- **`MonthSelector`** — tappable "June ▾" label + prev/next chevrons; for FREE, stepping past
  `earliestSelectableMonth(tier)` is disabled and surfaces an upsell affordance (tap → existing
  subscription screen).
- **`SpendingDonut`** — SVG donut from `donut-geometry.ts` (`arcSegments()`), center "Spent $X"
  label, legend rows (`CategoryAvatar` + name + amount), fed by `by-category?type=EXPENSE`.
- **`SpendTrend`** — SVG smoothed line + gradient area + current-month dot from
  `trend-geometry.ts` (`splinePath()`), plotting monthly expenses; Free shows 3 points, Pro 6.
- **`InsightCard`** — renders the styled insight from `InsightResult` structured fields; hides
  the projection clause when `projectionApplies` is false.

### 4. Charts geometry (pure, testable)

- `donut-geometry.ts`: `arcSegments(values, opts) → { d: string; color: string }[]` — pure arc
  math (SVG path `d` strings for each slice given radius/thickness/gap).
- `trend-geometry.ts`: `splinePath(points, dims) → { line: string; area: string; dots: {x,y}[] }`
  — pure Catmull-Rom-style smoothing + area fill + point coordinates.

Both are pure functions unit-tested like `resolveCategoryVisual`; the SVG components stay thin
render layers over them.

## Data flow

```
selectedMonth ── monthRange() ──► parallel:
   getSummary(from,to)     → MonthSummary (4 cards)
   getByCategory(from,to,EXPENSE) → SpendingDonut (legend uses resolveCategoryVisual)
   getInsight(from,to)     → InsightCard (client styles the sentence)
getTrend(months)           → SpendTrend           (fetched once, trailing window)
listAccounts()             → AccountCarousel       (month-independent)
listBudgets()              → BudgetList            (current month only)
tier + analyticsHistoryMonths(tier) → MonthSelector reach + server 403 guard
```

## Error handling / edge cases

- Each section keeps its own loading/error/empty state and retry (existing pattern) — one
  section failing never blanks the screen.
- FREE requests past the history cap → `403 tier_limit`; the client pre-empts this by disabling
  the stepper and showing the upsell, and treats a 403 as the upsell state if it slips through.
- Insight with no comparable history → `flat` + explanatory copy; no divide-by-zero.
- Empty month (no transactions) → donut empty state, cards zeroed, insight `flat`.
- Trend with fewer than N months of data → plot what exists (no fabricated points).

## Testing

- **Backend:** `InsightService` (projection math, retrospective, no-history + zero-last-month
  edges, day-count correctness); `by-category` widening (icon/color present); tier-cap guard
  (FREE `from` beyond cap → 403, within cap → ok, PRO unlimited).
- **Shared/core:** `analyticsHistoryMonths` per tier; `monthRange`/`addMonths`/
  `earliestSelectableMonth`; `donut-geometry` (slice angles/paths, gap handling, single/empty);
  `trend-geometry` (path points, <N months, flat series).
- **Mobile:** `MonthSelector` (reach + disabled boundary + upsell tap), `InsightCard` (styled
  render, projection shown/hidden), `SpendingDonut` + `SpendTrend` render from geometry,
  `DashboardScreen` month-change refetch + budgets-hidden-for-past-month.
- `pnpm test`, `pnpm lint`, `pnpm build` green before merge; mobile typecheck clean (build
  `@finby/core` + `@finby/shared` first).

## Follow-ups enabled (not this iteration)

- Web dashboard parity consuming the same `insight` endpoint + widened `by-category`.
- Promote the trend/donut geometry helpers to shared if web reuses them.
- Chart interactivity (tap a slice / scrub the trend).
- Budgets history view for past months.
