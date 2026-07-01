# Dashboard & Category Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four mobile refinements — past-month budgets, branded category avatars in the edit/filter dropdowns, a blocked-chevron a11y label, and an early-month insight floor.

**Architecture:** Small, mostly-independent changes across `packages/shared` (Category type), `packages/core` (listBudgets), `apps/api` (insight service), and `apps/mobile` (Dropdown, edit/filter sheets, MonthSelector, DashboardScreen). No web changes.

**Tech Stack:** TypeScript, NestJS (API), React Native + Expo (mobile). Tests: Vitest (`@finby/shared`, `@finby/core`, mobile `test:logic`), Jest + RNTL (mobile components).

## Global Constraints

- Package manager **pnpm** (v10, turbo). Filters: `@finby/shared`, `@finby/core`, `finby-api`, `finby-mobile`. No AI-attribution trailers.
- Build `@finby/shared` (and `@finby/core` for mobile) before running dependent tests/typecheck (`pnpm --filter` bypasses turbo `^build`).
- Type strippers (vitest/jest) hide type errors — run `pnpm --filter finby-mobile typecheck` (after building `@finby/core`+`@finby/shared`) and `pnpm --filter finby-api build`, not just the test runner.
- Repo uses `noUncheckedIndexedAccess: true`.
- The shared `Category` icon/color fields are **optional** (`icon?: string | null`) — the payload always includes them, but optional avoids rippling into the web app (maintenance) and existing fixtures.
- Insight floor: `MIN_PROJECTION_DAYS = 5`. Insight message copy is server-formatted with the currency code (matches the existing projected-savings clause).
- RNTL v14: mock `@expo/vector-icons`; decorative elements need `{ includeHiddenElements: true }`.

---

### Task 1: Client contracts — widen `Category`, `listBudgets(periodStart?)`

**Files:**
- Modify: `packages/shared/src/api-types.ts` (`Category`, ~line 216)
- Modify: `packages/core/src/api/dashboard-api.ts` (`listBudgets` interface + factory)
- Test: `packages/core/src/api/dashboard-api.test.ts`

**Interfaces:**
- Produces: `Category` gains optional `icon?: string | null; color?: string | null`; `DashboardApi.listBudgets(workspaceId: string, periodStart?: string): Promise<BudgetView[]>`.

- [ ] **Step 1: Write the failing test**

In `packages/core/src/api/dashboard-api.test.ts`, add (mirror the file's `mockAuthed`/`createDashboardApi` style):

```ts
  it('listBudgets passes periodStart when given', async () => {
    const authed = mockAuthed({ budgets: [] });
    const api = createDashboardApi(authed as never);
    await api.listBudgets('ws1', '2026-05-01');
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/budgets?periodStart=2026-05-01');
  });

  it('listBudgets omits periodStart when not given', async () => {
    const authed = mockAuthed({ budgets: [] });
    const api = createDashboardApi(authed as never);
    await api.listBudgets('ws1');
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/budgets');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @finby/core test -- dashboard-api`
Expected: FAIL — `listBudgets` called with the wrong URL (extra arg ignored).

- [ ] **Step 3: Widen the shared `Category` type**

In `packages/shared/src/api-types.ts`, change the `Category` interface:

```ts
export interface Category {
  id: string;
  name: string;
  isArchived: boolean;
  icon?: string | null;
  color?: string | null;
}
```

- [ ] **Step 4: Add `periodStart` to `listBudgets`**

In `packages/core/src/api/dashboard-api.ts`, change the interface method:

```ts
  listBudgets(workspaceId: string, periodStart?: string): Promise<BudgetView[]>;
```

and the factory implementation:

```ts
    async listBudgets(workspaceId, periodStart) {
      const q = periodStart ? `?${new URLSearchParams({ periodStart })}` : '';
      const res = await authed<{ budgets: BudgetView[] }>(`/workspaces/${workspaceId}/budgets${q}`);
      return res.budgets;
    },
```

- [ ] **Step 5: Run test + build**

Run: `pnpm --filter @finby/core test -- dashboard-api` → PASS.
Run: `pnpm --filter @finby/shared build && pnpm --filter @finby/core build` → succeed.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/api-types.ts packages/core/src/api/dashboard-api.ts packages/core/src/api/dashboard-api.test.ts
git commit -m "feat(core): Category icon/color + listBudgets periodStart"
```

---

### Task 2: Early-month insight floor (backend)

**Files:**
- Modify: `apps/api/src/modules/analytics/insight.service.ts`
- Test: `apps/api/src/modules/analytics/insight.service.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: for the current in-progress month with `< 5` days elapsed, `insight()` returns `projectionApplies:false`, `direction:'flat'`, null projections, and a "spent so far this month" message.

- [ ] **Step 1: Write the failing test**

In `apps/api/src/modules/analytics/insight.service.spec.ts`, add (reuse the file's `summary`/`make` helpers):

```ts
  it('suppresses the projection in the first days of the current month', async () => {
    const early = new Date('2026-07-03T00:00:00.000Z'); // day 3 → below the 5-day floor
    const svc = make(
      summary({ totalExpenses: '40', netSavings: '-40', transactionCount: 2 }),
      summary({ totalExpenses: '2000', transactionCount: 30 }),
    );
    const r = await svc.insight('ws1', 'USD', '2026-07-01', '2026-07-03', early);
    expect(r.projectionApplies).toBe(false);
    expect(r.projectedSpend).toBeNull();
    expect(r.projectedSavings).toBeNull();
    expect(r.direction).toBe('flat');
    expect(r.spendDeltaPercent).toBe(0);
    expect(r.message).toMatch(/so far this month/i);
    expect(r.message).toMatch(/40/); // month-to-date spend
  });

  it('still projects once enough of the month has elapsed', async () => {
    const midMonth = new Date('2026-07-15T00:00:00.000Z'); // day 15 → projects
    const svc = make(
      summary({ totalExpenses: '500', netSavings: '500', transactionCount: 5 }),
      summary({ totalExpenses: '2000', transactionCount: 30 }),
    );
    const r = await svc.insight('ws1', 'USD', '2026-07-01', '2026-07-15', midMonth);
    expect(r.projectionApplies).toBe(true);
    expect(r.direction).toBe('less');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @finby/shared build && pnpm --filter finby-api test -- insight.service`
Expected: FAIL — the day-3 case still projects (`projectionApplies` true).

- [ ] **Step 3: Add the floor**

In `apps/api/src/modules/analytics/insight.service.ts`, add the constant below the `iso` helper:

```ts
const MIN_PROJECTION_DAYS = 5;
```

Then, inside `insight()`, immediately after the `const curSpend = Number(cur.totalExpenses);` / `const prevSpend = Number(prev.totalExpenses);` lines, insert the early-month short-circuit:

```ts
    const daysElapsed = Math.max(1, now.getUTCDate());
    if (isCurrentMonth && daysElapsed < MIN_PROJECTION_DAYS) {
      const mtd = Math.round(curSpend).toLocaleString('en-US');
      return {
        period: { from: iso(periodStart), to: periodTo },
        currency,
        direction: 'flat',
        spendDeltaPercent: 0,
        projectionApplies: false,
        projectedSpend: null,
        projectedSavings: null,
        comparedTo: { from: iso(prevStart), to: iso(prevEnd) },
        message: `You've spent ${currency} ${mtd} so far this month.`,
      };
    }
```

Then, in the existing `if (isCurrentMonth) { ... }` projection block, **remove** its local `const daysElapsed = Math.max(1, now.getUTCDate());` line (reuse the one added above).

- [ ] **Step 4: Run test + build**

Run: `pnpm --filter finby-api test -- insight.service` → PASS (existing 3 + 2 new).
Run: `pnpm --filter finby-api build` → succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/analytics/insight.service.ts apps/api/src/modules/analytics/insight.service.spec.ts
git commit -m "feat(api): suppress noisy insight projection in the first days of the month"
```

---

### Task 3: `Dropdown` optional leading element (mobile)

**Files:**
- Modify: `apps/mobile/src/components/ui/dropdown.tsx`
- Test: `apps/mobile/src/components/ui/dropdown.test.tsx`

**Interfaces:**
- Produces: `Option<T>` gains `leading?: ReactNode`, rendered before the label in the trigger (selected option) and each list row.

- [ ] **Step 1: Write the failing test**

In `apps/mobile/src/components/ui/dropdown.test.tsx`, add a test (match the file's existing render/import style):

```tsx
  it('renders an option leading element in the trigger and the open list', async () => {
    const Dot = () => <Text>◆</Text>;
    const options = [{ value: 'a', label: 'Apple', leading: <Dot /> }];
    render(<Dropdown value="a" options={options} onSelect={() => {}} accessibilityLabel="Fruit" />);
    // trigger shows the leading of the selected option
    expect(screen.getAllByText('◆').length).toBeGreaterThanOrEqual(1);
  });
```

(Ensure `Text` is imported in the test; if the file lacks it, add `import { Text } from 'react-native';`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-mobile test:components -- dropdown`
Expected: FAIL — no `◆` rendered (leading not supported).

- [ ] **Step 3: Add `leading` support**

In `apps/mobile/src/components/ui/dropdown.tsx`:

Add the import at the top:

```tsx
import { useState, type ReactNode } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
```

Widen the option type:

```tsx
interface Option<T extends string> {
  value: T;
  label: string;
  leading?: ReactNode;
}
```

In the trigger, render the selected option's leading before its label — replace the trigger's label `<Text>` block with:

```tsx
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          {selected?.leading ?? null}
          <Text className={`flex-1 text-base ${selected ? 'text-ink' : 'text-faint'}`} numberOfLines={1}>
            {selected ? selected.label : placeholder}
          </Text>
        </View>
```

In the list row `renderItem`, render `item.leading` before the label — change the row's inner content to:

```tsx
                    <View className="min-w-0 flex-1 flex-row items-center gap-2">
                      {item.leading ?? null}
                      <Text className={`flex-1 text-base ${isSelected ? 'text-accent' : 'text-ink'}`} numberOfLines={1}>
                        {item.label}
                      </Text>
                    </View>
```

(Keep the `▾` on the trigger and the `✓` on the selected row exactly as they are, after this new `View`.)

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm --filter finby-mobile test:components -- dropdown` → PASS.
Run: `pnpm --filter @finby/core build && pnpm --filter @finby/shared build && pnpm --filter finby-mobile typecheck` → the change adds zero errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/ui/dropdown.tsx apps/mobile/src/components/ui/dropdown.test.tsx
git commit -m "feat(mobile): optional leading element in Dropdown options"
```

---

### Task 4: Category avatars in the edit sheet + filters (mobile)

**Files:**
- Modify: `apps/mobile/src/components/transactions/edit-transaction-sheet.tsx` (`categoryOptions`, ~line 54)
- Modify: `apps/mobile/src/components/transactions/transaction-filters-sheet.tsx` (`categoryOptions`, ~line 54)
- Test: `apps/mobile/src/components/transactions/edit-transaction-sheet.test.tsx`, `.../transaction-filters-sheet.test.tsx`

**Interfaces:**
- Consumes: widened `Category` (Task 1, optional icon/color); `Dropdown` `leading` (Task 3); `CategoryAvatar` (existing, `apps/mobile/src/components/category/category-avatar.tsx`).

- [ ] **Step 1: Update the tests**

In BOTH `edit-transaction-sheet.test.tsx` and `transaction-filters-sheet.test.tsx`, give a category fixture an `icon` so its avatar is a known glyph, and (in whichever test opens the category dropdown, or by opening it) assert the avatar appears. Minimal robust assertion — add `icon`/`color` to a category fixture and open the category dropdown, then check for the glyph. Example addition (adapt to each file's existing fixture + render):

```tsx
import { Ionicons } from '@expo/vector-icons';
// mock @expo/vector-icons to render its name (if the file doesn't already):
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));
// give a category an icon in the categories fixture:
//   { id: 'c1', name: 'Groceries', isArchived: false, icon: 'cart', color: '#1A7A4A' }
// in a test that opens the Category dropdown (fireEvent.press the "Category" trigger):
    fireEvent.press(screen.getByLabelText(/Category/));
    expect(screen.getByText('cart', { includeHiddenElements: true })).toBeTruthy();
```

(If a file's category fixture is `{ id, name, isArchived }`, it still typechecks since icon/color are optional — only the fixture you assert on needs `icon`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter finby-mobile test:components -- edit-transaction-sheet transaction-filters-sheet`
Expected: FAIL — no `cart` glyph in the dropdown (avatars not wired).

- [ ] **Step 3: Add avatars to the category options**

In `edit-transaction-sheet.tsx`, add the import:

```tsx
import { CategoryAvatar } from '../category/category-avatar';
```

and change `categoryOptions`:

```tsx
  const categoryOptions = [
    { value: '', label: 'Uncategorized' },
    ...categories
      .filter((c) => !c.isArchived)
      .map((c) => ({
        value: c.id,
        label: c.name,
        leading: <CategoryAvatar category={{ name: c.name, icon: c.icon, color: c.color }} size="sm" />,
      })),
  ];
```

Do the exact same in `transaction-filters-sheet.tsx` (its sentinel label is `'All categories'`; add the `CategoryAvatar` import and the same `.map(...)` with `leading`).

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter finby-mobile test:components -- edit-transaction-sheet transaction-filters-sheet` → PASS.
Run: `pnpm --filter @finby/core build && pnpm --filter @finby/shared build && pnpm --filter finby-mobile typecheck` → zero new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/transactions/edit-transaction-sheet.tsx apps/mobile/src/components/transactions/transaction-filters-sheet.tsx apps/mobile/src/components/transactions/edit-transaction-sheet.test.tsx apps/mobile/src/components/transactions/transaction-filters-sheet.test.tsx
git commit -m "feat(mobile): branded category avatars in edit + filter dropdowns"
```

---

### Task 5: MonthSelector blocked-chevron a11y (mobile)

**Files:**
- Modify: `apps/mobile/src/components/dashboard/month-selector.tsx` (prev chevron, ~line 34)
- Test: `apps/mobile/src/components/dashboard/month-selector.test.tsx`

**Interfaces:**
- Consumes: existing `prevBlocked`.
- Produces: prev chevron `accessibilityLabel` is `'Upgrade to see older months'` when `prevBlocked`, else `'Previous month'`.

- [ ] **Step 1: Update the test**

In `month-selector.test.tsx`, the FREE far-past test currently presses `getByLabelText(/Previous month/)`. Update it to expect the upgrade label when blocked, and keep the PRO test on "Previous month":

```tsx
  it('opens the upgrade sheet instead of navigating when a FREE user hits the history floor', async () => {
    const onChange = jest.fn();
    await render(<MonthSelector month={{ year: 2000, month: 0 }} onChange={onChange} tier="FREE" />);
    fireEvent.press(screen.getByLabelText('Upgrade to see older months'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('PLANS_OPEN')).toBeTruthy();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-mobile test:components -- month-selector`
Expected: FAIL — no element labelled "Upgrade to see older months".

- [ ] **Step 3: Make the label conditional**

In `month-selector.tsx`, change the prev chevron's `accessibilityLabel` (line ~34) to:

```tsx
          accessibilityLabel={prevBlocked ? 'Upgrade to see older months' : 'Previous month'}
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm --filter finby-mobile test:components -- month-selector` → PASS (2 tests).
Run: `pnpm --filter @finby/core build && pnpm --filter @finby/shared build && pnpm --filter finby-mobile typecheck` → zero new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/dashboard/month-selector.tsx apps/mobile/src/components/dashboard/month-selector.test.tsx
git commit -m "feat(mobile): announce the blocked month chevron as an upgrade action"
```

---

### Task 6: Budgets for past months + full gate (mobile)

**Files:**
- Modify: `apps/mobile/src/screens/dashboard-screen.tsx`
- Test: `apps/mobile/src/screens/dashboard-screen.test.tsx`

**Interfaces:**
- Consumes: `listBudgets(workspaceId, periodStart?)` (Task 1); `monthToRange` (existing).

- [ ] **Step 1: Update the test**

In `dashboard-screen.test.tsx`, add an assertion that budgets are fetched with the selected month's `periodStart` (the mount month is the current month). With the existing PRO/workspace mock and `api.dashboard.listBudgets` as a `jest.fn()`, add:

```tsx
    expect(api.dashboard.listBudgets).toHaveBeenCalledWith('w1', expect.stringMatching(/^\d{4}-\d{2}-01$/));
```

(If the existing mock asserts `listBudgets` called with just `'w1'`, update that expectation to the two-arg form above.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-mobile test:components -- dashboard-screen`
Expected: FAIL — `listBudgets` called with one arg (no `periodStart`).

- [ ] **Step 3: Move budgets into the month-scoped group**

In `apps/mobile/src/screens/dashboard-screen.tsx`:

1. In `loadStatic`, REMOVE the budgets fetch (the `api.dashboard.listBudgets(...)` block and its `setBudgets` calls) and drop `setBudgets(LOADING)` from `loadStatic`.
2. In `loadMonth(m)`, add a budgets fetch alongside summary/donut/insight, using the month's `from` as `periodStart`. Add `setBudgets(LOADING)` at the top of `loadMonth`, and add to its `Promise.all([...])`:

```ts
        api.dashboard
          .listBudgets(workspace.id, from)
          .then((d) => setBudgets({ data: d, loading: false, error: null }))
          .catch((e) => setBudgets({ data: null, loading: false, error: errMsg(e) })),
```

3. In the JSX, replace the current-month guard with an always-render, and point its retry at the month loader:

```tsx
        <BudgetList state={budgets} onRetry={() => loadMonth(month)} />
```

(Remove the `{isCurrentMonth ? <BudgetList ... /> : null}` wrapper and the now-unused `isCurrentMonth` local if nothing else uses it.)

- [ ] **Step 4: Run the screen test**

Run: `pnpm --filter finby-mobile test:components -- dashboard-screen` → PASS.

- [ ] **Step 5: Full gate**

Run:
```bash
pnpm --filter @finby/core build
pnpm --filter @finby/shared build
pnpm --filter finby-mobile typecheck   # ZERO errors
pnpm --filter finby-mobile test        # vitest + jest
pnpm --filter finby-api test -- insight.service analytics
pnpm lint                              # 0 errors (pre-existing sw.js warning OK)
```
Expected: all pass. (`finby-mobile test` may show up to ~2 known flaky-under-parallelism suites — `streak-sheet`, `edit-transaction-sheet` — that pass in isolation; re-run those two individually to confirm if they flake.)

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens/dashboard-screen.tsx apps/mobile/src/screens/dashboard-screen.test.tsx
git commit -m "feat(mobile): show budgets for the selected month (past months included)"
```

---

## Self-Review

**Spec coverage:**
- Budgets for past months → Task 1 (core `periodStart`) + Task 6 (dashboard month-scope + always render). ✅
- Category visuals on edit sheet + filters → Task 1 (Category widen) + Task 3 (Dropdown `leading`) + Task 4 (avatars). ✅
- Blocked back-chevron a11y → Task 5. ✅
- Early-month insight floor (N=5) → Task 2. ✅
- Out of scope (picker, web) → untouched. ✅

**Placeholder scan:** No TBD/TODO; every code step is complete. Test steps adapt to each file's existing fixture/mock style, with the concrete assertion given.

**Type consistency:** `Category.icon?/color?` (Task 1) consumed by `CategoryAvatar` in Task 4. `Dropdown` `Option.leading?` (Task 3) consumed in Task 4. `listBudgets(ws, periodStart?)` (Task 1) consumed in Task 6. `InsightResult` shape unchanged (Task 2 only changes values). `prevBlocked` (existing) reused in Task 5.
