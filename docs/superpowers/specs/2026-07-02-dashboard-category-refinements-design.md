# Dashboard & Category Refinements

**Date:** 2026-07-02
**Status:** Approved design (pending spec review)
**Area:** `apps/api` (categories list, insight service), `packages/shared` + `packages/core` (Category type, listBudgets), `apps/mobile` (budgets scope, Dropdown, edit/filter sheets, MonthSelector, InsightCard)

## Summary

A batch of four independent refinements to the just-shipped mobile dashboard + category
visuals: show **budgets for past months**, put **branded category avatars in the edit/filter
dropdowns**, fix the **blocked back-chevron accessibility label**, and remove **early-month
insight projection noise**. All four are mobile-facing; the web app is in maintenance and out of
scope. The category **emoji/icon picker** is deferred to a v2 sub-project.

## Goals

- Navigating to a past month shows that month's budgets and spend (not hidden).
- The category picker in the edit-transaction sheet and the filters sheet shows the *same*
  branded icon/emoji as the transaction rows — one consistent category visual everywhere.
- A Free user at the history floor hears a meaningful screen-reader label on the blocked chevron.
- The current-month insight never shows a wild projection in the first few days of the month.

## Non-goals (deferred)

- **Category emoji/icon picker** — a v2 sub-project (needs a category-management/editor screen +
  emoji picker + create/update API, none of which exist).
- **Web parity** — the web PWA is in maintenance until a real web version is built.
- Category avatars on surfaces beyond rows + the two dropdowns (e.g. chat action cards).

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Budgets past months | Month-scope budgets (pass `periodStart`), show for any month |
| Category visuals in dropdowns | **Branded avatars** — extend `Dropdown` with `leading?`, widen `Category` with icon/color |
| Blocked chevron a11y | Label "Upgrade to see older months" when `prevBlocked` |
| Early-month insight | Server min-days floor **N = 5**: <5 days elapsed → neutral "spent so far", no projection |
| Picker | Deferred to v2 |

## Architecture

### 1. Budgets for past months

- `packages/core` `DashboardApi.listBudgets(workspaceId, periodStart?: string)` — appends
  `?periodStart=YYYY-MM-DD` when provided. The API's `GET /workspaces/:id/budgets` already
  accepts `periodStart` (`budgets.service.list` anchors to it), so no backend change.
- `apps/mobile` `DashboardScreen`: move budgets out of the once-only `loadStatic` group into the
  month-scoped `loadMonth` group, fetching with `monthToRange(selectedMonth).from` as
  `periodStart`. Remove the `isCurrentMonth ? <BudgetList/> : null` guard — `BudgetList` renders
  for every month. A month with no budgets shows the existing "No budgets yet." empty state.

### 2. Category visuals on the edit sheet + filters

- **Shared:** widen `Category` (`packages/shared/src/api-types.ts`) `{ id, name, isArchived }` →
  `{ id, name, isArchived, icon: string | null, color: string | null }`.
- **API:** the categories-list serializer (`GET /workspaces/:id/categories` →
  `{ categories: Category[] }`) includes `icon` + `color` (the `Category` Prisma model already
  has both; the list select currently omits them). Update the backend category-list type/select.
- **`Dropdown`** (`apps/mobile/src/components/ui/dropdown.tsx`): add an optional
  `leading?: ReactNode` to `Option<T>`, rendered before the label in **both** the trigger
  (selected option) and each list row. Backward-compatible — the other 7 consumers pass nothing.
- **Edit sheet + filters** (`edit-transaction-sheet.tsx`, `transaction-filters-sheet.tsx`):
  build category options as `{ value: c.id, label: c.name, leading: <CategoryAvatar category={c}
  size="sm" /> }`. The sentinel option ("Uncategorized" / "All categories", value `''`) has no
  `leading`. `CategoryAvatar` consumes the widened category's icon/color.

### 3. Blocked back-chevron a11y

- `MonthSelector` (`month-selector.tsx`): the prev chevron's `accessibilityLabel` is
  `prevBlocked ? 'Upgrade to see older months' : 'Previous month'`. No behavior change (blocked
  still opens `PlanCarouselSheet`).

### 4. Early-month insight (min-days floor, N = 5)

- `InsightService` (`apps/api/.../analytics/insight.service.ts`): a `MIN_PROJECTION_DAYS = 5`
  constant. When the viewed period is the in-progress current month **and**
  `daysElapsed < MIN_PROJECTION_DAYS`:
  - `projectionApplies = false`, `projectedSpend = null`, `projectedSavings = null`,
    `direction = 'flat'`, `spendDeltaPercent = 0`, `comparedTo` still the prior month.
  - `message = "You've spent {currency} {mtd} so far this month."` (MTD = current-month expenses
    to date, formatted like the existing projected-savings clause).
  - `InsightCard`'s existing `direction === 'flat'` branch renders `message` plainly — no client
    change required.
- `daysElapsed >= 5` (and all past months) → unchanged pace/retrospective behavior.

## Data flow (dashboard, updated)

```
selectedMonth ── monthToRange ──► loadMonth:
   getSummary / getByCategory / getInsight / listBudgets(periodStart=from)   [month-scoped]
loadStatic: listAccounts / getTrend                                          [once]
categories (listCategories, now with icon/color) → edit sheet + filter dropdowns → CategoryAvatar
tier + earliestAllowedMonthStart → MonthSelector (blocked chevron → upsell + a11y label)
```

## Error handling / edge cases

- Past month with no budgets → "No budgets yet." (existing empty state); budgets section keeps
  its own loading/error/retry.
- Categories list without icon/color (older API) → `CategoryAvatar` derives from name (registry
  already handles null icon/color), so the dropdown degrades gracefully.
- Insight: `daysElapsed` is `max(1, now.getUTCDate())`; the `< 5` check is only for the current
  in-progress month, so past/complete months never enter the "so far" branch.
- No-history current month within the first 5 days → shows the neutral "spent so far" message
  (takes precedence over "not enough history"), which is accurate.

## Testing

- **Core:** `listBudgets(ws, '2026-05-01')` builds `/budgets?periodStart=2026-05-01`; no-arg call
  omits the param.
- **Backend:** categories list returns `icon`/`color`; `InsightService` at `daysElapsed = 3` →
  `projectionApplies:false`, flat, "so far" message; at `daysElapsed = 10` → projection as before.
- **Shared:** `Category` widened shape.
- **Mobile:** `Dropdown` renders a `leading` element when provided (and omits it otherwise);
  edit sheet + filters render a `CategoryAvatar` per category option; `MonthSelector` uses the
  upgrade label when blocked; `DashboardScreen` fetches budgets with the selected month's
  `periodStart` and renders `BudgetList` for a past month.
- `pnpm test` / `pnpm lint` / mobile `typecheck` green before merge.

## Follow-ups (not this iteration)

- **v2:** category emoji/icon picker + a category-management screen (create/edit categories,
  choose an emoji; the registry's resolution step 2 already consumes a stored emoji).
- Web parity when a real web dashboard is built.
