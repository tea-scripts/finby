# Dashboard Money+Insights — Plan A1 (Backend + Contracts) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the backend + shared/core contracts for the redesigned dashboard: a new `analytics/insight` endpoint, `by-category` widened with category icon/color, tier-gated month history, and the `@finby/core` API methods the mobile screen will call.

**Architecture:** All work is in `apps/api` (analytics module), `packages/shared` (result types + tier helpers), and `packages/core` (client API methods). This plan produces working, tested API + contracts on its own; the mobile UI (Plan A2) consumes it.

**Tech Stack:** TypeScript, NestJS + Prisma (API), Zod DTOs, Vitest (`@finby/shared`, `@finby/core`), Jest (`finby-api`).

## Global Constraints

- Package manager is **pnpm** (v10, turbo). Workspace filters: `@finby/shared`, `@finby/core`, `finby-api` (NOT `@finby/api`). No AI-attribution trailers on commits.
- Repo uses `noUncheckedIndexedAccess: true` — guard array/record index access.
- Type strippers (jest/vitest) hide type errors: after backend edits run `pnpm --filter @finby/shared build` then `pnpm --filter finby-api build` (nest build = tsc) — not just the test runner.
- Tier-gate 403 pattern (copy verbatim): `throw new ForbiddenException({ error: 'tier_limit', message: '...' })`.
- Insight numbers must be honest: current in-progress month uses pace/projection; past months are retrospective actuals with `projectionApplies: false`. No divide-by-zero.
- `analyticsHistoryMonths(tier)` = `TIER_LIMITS[tier].analyticsTrendMonths` (FREE = 3, others = null). Do not hardcode 3.

---

### Task 1: Shared analytics contracts + tier/history helpers

**Files:**
- Create: `packages/shared/src/analytics.ts`
- Create: `packages/shared/src/analytics.test.ts`
- Modify: `packages/shared/src/index.ts` (export `./analytics`)
- Modify: `packages/shared/src/api-types.ts` (add result types after `SummaryResult`, ~line 152)

**Interfaces:**
- Consumes: `TIER_LIMITS`, `SubscriptionTier` from `@finby/shared`.
- Produces:
  - `analyticsHistoryMonths(tier: SubscriptionTier): number | null`
  - `earliestAllowedMonthStart(tier: SubscriptionTier, now?: Date): string | null` (YYYY-MM-DD, UTC first-of-month, or null = unlimited)
  - types `CategoryBreakdownItem` (category `{ id, name, icon: string|null, color: string|null }`), `CategoryBreakdownResult`, `TrendPoint`, `TrendResult`, `InsightResult`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/analytics.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { analyticsHistoryMonths, earliestAllowedMonthStart } from './analytics';

const JULY_2026 = new Date('2026-07-15T12:00:00.000Z');

describe('analyticsHistoryMonths', () => {
  it('caps FREE at 3 months and leaves paid tiers unlimited', () => {
    expect(analyticsHistoryMonths('FREE')).toBe(3);
    expect(analyticsHistoryMonths('PRO')).toBeNull();
    expect(analyticsHistoryMonths('PREMIUM')).toBeNull();
    expect(analyticsHistoryMonths('FAMILY')).toBeNull();
  });
});

describe('earliestAllowedMonthStart', () => {
  it('returns the first day of the month (N-1) months back for FREE', () => {
    // July 2026, 3 months → May 2026, June, July viewable → earliest = 2026-05-01
    expect(earliestAllowedMonthStart('FREE', JULY_2026)).toBe('2026-05-01');
  });

  it('returns null (no floor) for unlimited tiers', () => {
    expect(earliestAllowedMonthStart('PRO', JULY_2026)).toBeNull();
  });

  it('handles year boundaries', () => {
    // Feb 2026, 3 months → Dec 2025, Jan, Feb → earliest = 2025-12-01
    expect(earliestAllowedMonthStart('FREE', new Date('2026-02-10T00:00:00.000Z'))).toBe('2025-12-01');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @finby/shared test -- analytics`
Expected: FAIL — `Cannot find module './analytics'`.

- [ ] **Step 3: Write the helpers**

Create `packages/shared/src/analytics.ts`:

```ts
import { TIER_LIMITS } from './constants';
import type { SubscriptionTier } from './types';

/** How many months of dashboard history a tier may view. null = unlimited.
 *  Mirrors the trend cap so dashboard/trend/history stay consistent (do not
 *  hardcode the number here — it derives from the tier matrix). */
export function analyticsHistoryMonths(tier: SubscriptionTier): number | null {
  return TIER_LIMITS[tier].analyticsTrendMonths;
}

/** First day (YYYY-MM-DD, UTC) of the earliest month a tier may view, or null
 *  when unlimited. FREE (3 months) in July 2026 → '2026-05-01'. */
export function earliestAllowedMonthStart(
  tier: SubscriptionTier,
  now: Date = new Date(),
): string | null {
  const months = analyticsHistoryMonths(tier);
  if (months === null) return null;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  return start.toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Add the client result types**

In `packages/shared/src/api-types.ts`, immediately after the `SummaryResult` interface (~line 152), add:

```ts
/** GET analytics/by-category */
export interface CategoryBreakdownItem {
  category: { id: string; name: string; icon: string | null; color: string | null };
  total: string;
  percent: number;
  transactionCount: number;
}
export interface CategoryBreakdownResult {
  breakdown: CategoryBreakdownItem[];
  currency: string;
}

/** GET analytics/trend */
export interface TrendPoint {
  month: string; // YYYY-MM
  income: string;
  expenses: string;
  savings: string;
}
export interface TrendResult {
  trend: TrendPoint[];
  currency: string;
}

/** GET analytics/insight — structured signal + a plain message (a11y/fallback).
 *  The client composes the styled sentence from the structured fields. */
export interface InsightResult {
  period: { from: string; to: string };
  currency: string;
  direction: 'less' | 'more' | 'flat'; // current spend vs last month
  spendDeltaPercent: number; // magnitude >= 0; direction carries the sign
  projectionApplies: boolean; // true only for the in-progress current month
  projectedSpend: string | null;
  projectedSavings: string | null;
  comparedTo: { from: string; to: string };
  message: string;
}
```

- [ ] **Step 5: Export the helpers**

In `packages/shared/src/index.ts`, add after the other exports:

```ts
export * from './analytics';
```

- [ ] **Step 6: Run test + typecheck**

Run: `pnpm --filter @finby/shared test -- analytics` → PASS (5 tests).
Run: `pnpm --filter @finby/shared build` → succeeds (types compile under `noUncheckedIndexedAccess`).

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/analytics.ts packages/shared/src/analytics.test.ts packages/shared/src/index.ts packages/shared/src/api-types.ts
git commit -m "feat(shared): analytics history helpers + insight/breakdown/trend client types"
```

---

### Task 2: Widen `by-category` with category icon + color

**Files:**
- Modify: `apps/api/src/modules/analytics/analytics.types.ts` (`CategoryBreakdownItem.category`)
- Modify: `apps/api/src/modules/analytics/analytics.service.ts` (`byCategory`, ~line 107)
- Test: `apps/api/src/modules/analytics/analytics.service.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `by-category` breakdown items now carry `category: { id, name, icon, color }` (matches shared `CategoryBreakdownItem`).

- [ ] **Step 1: Write the failing test**

In `apps/api/src/modules/analytics/analytics.service.spec.ts`, add a test asserting the widened category. Use the existing spec's Prisma-mock style (mirror how `byCategory` is already tested — mock `category.findMany` to return icon/color). Add:

```ts
  it('byCategory includes each category icon and color', async () => {
    prisma.transaction.groupBy.mockResolvedValue([
      { categoryId: 'c1', _sum: { amountBase: new Prisma.Decimal(100) }, _count: 2 },
    ] as never);
    prisma.category.findMany.mockResolvedValue([
      { id: 'c1', name: 'Groceries', icon: 'cart', color: '#1A7A4A' },
    ] as never);

    const res = await service.byCategory('ws1', 'USD', '2026-07-01', '2026-07-31', 'EXPENSE');

    expect(res.breakdown[0].category).toEqual({
      id: 'c1',
      name: 'Groceries',
      icon: 'cart',
      color: '#1A7A4A',
    });
  });
```

(If the spec has no `prisma.category.findMany` mock helper yet, add it to the existing prisma mock object the same way `groupBy` is mocked.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-api test -- analytics.service`
Expected: FAIL — received category lacks `icon`/`color`.

- [ ] **Step 3: Widen the API type**

In `apps/api/src/modules/analytics/analytics.types.ts`, change `CategoryBreakdownItem`:

```ts
export interface CategoryBreakdownItem {
  category: { id: string; name: string; icon: string | null; color: string | null };
  total: string;
  percent: number;
  transactionCount: number;
}
```

- [ ] **Step 4: Widen the select + mapping in `byCategory`**

In `apps/api/src/modules/analytics/analytics.service.ts` `byCategory`, change the category fetch + mapping. Replace the `findMany` select and the `nameById` map with a full-record map, and build the widened category:

```ts
    const ids = grouped.map((g) => g.categoryId).filter((id): id is string => id !== null);
    const categories = await this.prisma.category.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, icon: true, color: true },
    });
    const catById = new Map(categories.map((c) => [c.id, c]));
```

and in the `.map((g) => { ... })`, replace the `category` object:

```ts
        const cat = g.categoryId ? catById.get(g.categoryId) : undefined;
        return {
          category: {
            id: g.categoryId ?? 'uncategorized',
            name: g.categoryId ? (cat?.name ?? 'Unknown') : 'Uncategorized',
            icon: cat?.icon ?? null,
            color: cat?.color ?? null,
          },
          total: total.toString(),
          percent: percent(total, grandTotal),
          transactionCount: g._count,
        };
```

- [ ] **Step 5: Run test + build**

Run: `pnpm --filter finby-api test -- analytics.service` → PASS.
Run: `pnpm --filter finby-api build` → succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/analytics/analytics.types.ts apps/api/src/modules/analytics/analytics.service.ts apps/api/src/modules/analytics/analytics.service.spec.ts
git commit -m "feat(api): include category icon+color in by-category breakdown"
```

---

### Task 3: Insight endpoint (`GET analytics/insight`)

**Files:**
- Create: `apps/api/src/modules/analytics/insight.service.ts`
- Create: `apps/api/src/modules/analytics/insight.service.spec.ts`
- Modify: `apps/api/src/modules/analytics/dto/analytics.schemas.ts` (add `insightQuerySchema`)
- Modify: `apps/api/src/modules/analytics/analytics.controller.ts` (add `@Get('insight')`)
- Modify: `apps/api/src/modules/analytics/analytics.module.ts` (provide `InsightService`)

**Interfaces:**
- Consumes: `AnalyticsService.summary(workspaceId, currency, from, to): Promise<SummaryResult>`; shared `InsightResult`.
- Produces: `InsightService.insight(workspaceId, currency, from, to, now?): Promise<InsightResult>`; route `GET /workspaces/:id/analytics/insight?from&to`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/analytics/insight.service.spec.ts`:

```ts
import { InsightService } from './insight.service';
import type { SummaryResult } from '@finby/shared';

function summary(over: Partial<SummaryResult>): SummaryResult {
  return {
    period: { from: '2026-07-01', to: '2026-07-15' },
    totalIncome: '0',
    totalExpenses: '0',
    netSavings: '0',
    savingsRate: 0,
    currency: 'USD',
    transactionCount: 0,
    ...over,
  };
}

describe('InsightService', () => {
  const NOW = new Date('2026-07-15T00:00:00.000Z'); // 15 days elapsed, July has 31 days

  function make(cur: SummaryResult, prev: SummaryResult) {
    const analytics = { summary: jest.fn() } as unknown as { summary: jest.Mock };
    analytics.summary.mockResolvedValueOnce(cur).mockResolvedValueOnce(prev);
    return new InsightService(analytics as never);
  }

  it('projects the current month and reports spending on pace vs last month', async () => {
    // spent 500 in 15 days → projected ~1033.33 for 31 days; last month spent 2000 → less
    const svc = make(
      summary({ totalExpenses: '500', netSavings: '500', transactionCount: 5 }),
      summary({ totalExpenses: '2000', transactionCount: 30 }),
    );
    const r = await svc.insight('ws1', 'USD', '2026-07-01', '2026-07-15', NOW);
    expect(r.projectionApplies).toBe(true);
    expect(r.direction).toBe('less');
    expect(Number(r.projectedSpend)).toBeCloseTo((500 * 31) / 15, 1);
    expect(Number(r.projectedSavings)).toBeCloseTo((500 * 31) / 15, 1);
    expect(r.spendDeltaPercent).toBeGreaterThan(0);
    expect(r.comparedTo).toEqual({ from: '2026-06-01', to: '2026-06-30' });
  });

  it('is retrospective (no projection) for a past month', async () => {
    const svc = make(
      summary({ totalExpenses: '1800', transactionCount: 20 }),
      summary({ totalExpenses: '2000', transactionCount: 25 }),
    );
    const r = await svc.insight('ws1', 'USD', '2026-05-01', '2026-05-31', NOW);
    expect(r.projectionApplies).toBe(false);
    expect(r.projectedSpend).toBeNull();
    expect(r.projectedSavings).toBeNull();
    expect(r.direction).toBe('less'); // 1800 < 2000
  });

  it('returns flat with a friendly message when there is no prior-month history', async () => {
    const svc = make(
      summary({ totalExpenses: '300', netSavings: '100', transactionCount: 3 }),
      summary({ totalExpenses: '0', transactionCount: 0 }),
    );
    const r = await svc.insight('ws1', 'USD', '2026-07-01', '2026-07-15', NOW);
    expect(r.direction).toBe('flat');
    expect(r.spendDeltaPercent).toBe(0);
    expect(r.message).toMatch(/not enough history/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-api test -- insight.service`
Expected: FAIL — `Cannot find module './insight.service'`.

- [ ] **Step 3: Write `InsightService`**

Create `apps/api/src/modules/analytics/insight.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { InsightResult } from '@finby/shared';
import { AnalyticsService } from './analytics.service';

const iso = (d: Date): string => d.toISOString().slice(0, 10);

@Injectable()
export class InsightService {
  constructor(private readonly analytics: AnalyticsService) {}

  async insight(
    workspaceId: string,
    currency: string,
    from: string,
    to: string,
    now: Date = new Date(),
  ): Promise<InsightResult> {
    const fromDate = new Date(`${from.slice(0, 10)}T00:00:00.000Z`);
    const y = fromDate.getUTCFullYear();
    const m = fromDate.getUTCMonth();

    const periodStart = new Date(Date.UTC(y, m, 1));
    const periodEnd = new Date(Date.UTC(y, m + 1, 0)); // last day of the viewed month
    const prevStart = new Date(Date.UTC(y, m - 1, 1));
    const prevEnd = new Date(Date.UTC(y, m, 0)); // last day of the prior month

    const isCurrentMonth = y === now.getUTCFullYear() && m === now.getUTCMonth();
    const periodTo = isCurrentMonth ? iso(now) : iso(periodEnd);

    const [cur, prev] = await Promise.all([
      this.analytics.summary(workspaceId, currency, iso(periodStart), periodTo),
      this.analytics.summary(workspaceId, currency, iso(prevStart), iso(prevEnd)),
    ]);

    const curSpend = Number(cur.totalExpenses);
    const prevSpend = Number(prev.totalExpenses);

    let projectedSpend: number | null = null;
    let projectedSavings: number | null = null;
    let comparisonSpend = curSpend;

    if (isCurrentMonth) {
      const daysElapsed = Math.max(1, now.getUTCDate());
      const daysInMonth = periodEnd.getUTCDate();
      const factor = daysInMonth / daysElapsed;
      projectedSpend = curSpend * factor;
      projectedSavings = Number(cur.netSavings) * factor;
      comparisonSpend = projectedSpend;
    }

    const hasPrev = prev.transactionCount > 0 && prevSpend > 0;
    let direction: 'less' | 'more' | 'flat' = 'flat';
    let spendDeltaPercent = 0;
    if (hasPrev) {
      const deltaPct = ((comparisonSpend - prevSpend) / prevSpend) * 100;
      spendDeltaPercent = Math.round(Math.abs(deltaPct));
      direction = deltaPct < -0.5 ? 'less' : deltaPct > 0.5 ? 'more' : 'flat';
    }

    const round2 = (n: number): string => n.toFixed(2);
    return {
      period: { from: iso(periodStart), to: periodTo },
      currency,
      direction,
      spendDeltaPercent,
      projectionApplies: isCurrentMonth,
      projectedSpend: projectedSpend === null ? null : round2(projectedSpend),
      projectedSavings: projectedSavings === null ? null : round2(projectedSavings),
      comparedTo: { from: iso(prevStart), to: iso(prevEnd) },
      message: buildMessage({
        hasPrev,
        direction,
        spendDeltaPercent,
        isCurrentMonth,
        projectedSavings,
        currency,
      }),
    };
  }
}

function buildMessage(p: {
  hasPrev: boolean;
  direction: 'less' | 'more' | 'flat';
  spendDeltaPercent: number;
  isCurrentMonth: boolean;
  projectedSavings: number | null;
  currency: string;
}): string {
  if (!p.hasPrev) return 'Not enough history yet to compare to last month.';
  const verb = p.isCurrentMonth ? 'on pace to spend' : 'spent';
  const cmp = p.isCurrentMonth ? 'last month' : 'the month before';
  if (p.direction === 'flat') return `You're spending about the same as ${cmp}.`;
  const dir = p.direction === 'less' ? 'less' : 'more';
  let msg = `You're ${verb} ${p.spendDeltaPercent}% ${dir} than ${cmp}.`;
  if (p.isCurrentMonth && p.projectedSavings !== null && p.projectedSavings > 0) {
    const amount = Math.round(p.projectedSavings).toLocaleString('en-US');
    msg += ` At this rate you'll save ${p.currency} ${amount} this month.`;
  }
  return msg;
}
```

- [ ] **Step 4: Run the service test**

Run: `pnpm --filter finby-api test -- insight.service` → PASS (3 tests).

- [ ] **Step 5: Add DTO, controller route, and provider**

In `apps/api/src/modules/analytics/dto/analytics.schemas.ts`, add:

```ts
export const insightQuerySchema = z.object({
  from: isoDate,
  to: isoDate,
});
export type InsightQuery = z.infer<typeof insightQuerySchema>;
```

In `apps/api/src/modules/analytics/analytics.module.ts`, import and provide `InsightService`:

```ts
import { InsightService } from './insight.service';
// ...
  providers: [AnalyticsService, FinancialIntelligenceService, InsightService],
  exports: [AnalyticsService, FinancialIntelligenceService, InsightService],
```

In `apps/api/src/modules/analytics/analytics.controller.ts`: add the import + constructor dep + route. Add to the schema import block `insightQuerySchema, type InsightQuery`, add `import type { InsightResult } from '@finby/shared';`, add `import { InsightService } from './insight.service';`, change the constructor to also inject it, and add the handler:

```ts
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly insights: InsightService,
  ) {}

  @Get('insight')
  insight(
    @Workspace() workspace: WorkspaceContext,
    @Query(new ZodValidationPipe(insightQuerySchema)) query: InsightQuery,
  ): Promise<InsightResult> {
    return this.insights.insight(workspace.id, workspace.baseCurrency, query.from, query.to);
  }
```

- [ ] **Step 6: Build + full analytics tests**

Run: `pnpm --filter @finby/shared build && pnpm --filter finby-api build` → succeed.
Run: `pnpm --filter finby-api test -- analytics insight` → PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/analytics/insight.service.ts apps/api/src/modules/analytics/insight.service.spec.ts apps/api/src/modules/analytics/dto/analytics.schemas.ts apps/api/src/modules/analytics/analytics.controller.ts apps/api/src/modules/analytics/analytics.module.ts
git commit -m "feat(api): analytics/insight endpoint (pace projection + retrospective)"
```

---

### Task 4: Tier-gated month history on summary / by-category / insight

**Files:**
- Modify: `apps/api/src/modules/analytics/analytics.controller.ts` (guard the three user-facing month endpoints)
- Test: `apps/api/src/modules/analytics/analytics.controller.spec.ts` (create if absent)

**Interfaces:**
- Consumes: `earliestAllowedMonthStart(tier, now?)` from `@finby/shared`; `workspace.tier`.
- Produces: `summary`/`by-category`/`insight` throw `ForbiddenException({ error: 'tier_limit', ... })` when a capped tier requests a `from` older than its window. Internal callers of `AnalyticsService` (chat, financial-intelligence) are unaffected — the guard lives in the controller only.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/analytics/analytics.controller.spec.ts`:

```ts
import { ForbiddenException } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';

function ctrl() {
  const analytics = {
    summary: jest.fn().mockResolvedValue({ ok: true }),
    byCategory: jest.fn().mockResolvedValue({ ok: true }),
  } as never;
  const insights = { insight: jest.fn().mockResolvedValue({ ok: true }) } as never;
  return new AnalyticsController(analytics, insights);
}

const FREE = { id: 'ws1', baseCurrency: 'USD', tier: 'FREE' } as never;
const PRO = { id: 'ws1', baseCurrency: 'USD', tier: 'PRO' } as never;

describe('AnalyticsController history gating', () => {
  it('rejects a FREE request for a month older than the 3-month window', async () => {
    // Far past date is guaranteed outside FREE's window regardless of "now".
    await expect(
      ctrl().summary(FREE, { from: '2000-01-01', to: '2000-01-31' } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a PRO request for an old month (unlimited)', async () => {
    await expect(
      ctrl().summary(PRO, { from: '2000-01-01', to: '2000-01-31' } as never),
    ).resolves.toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-api test -- analytics.controller`
Expected: FAIL — no guard yet (FREE call resolves instead of throwing), or module-not-found.

- [ ] **Step 3: Add the guard to the controller**

In `apps/api/src/modules/analytics/analytics.controller.ts`, add imports and a private guard, and call it from `summary`, `byCategory`, and `insight` before delegating:

```ts
import { Controller, ForbiddenException, Get, Query, UseGuards } from '@nestjs/common';
import { earliestAllowedMonthStart } from '@finby/shared';
```

Add the private method inside the class:

```ts
  /** User-facing month endpoints only: capped tiers cannot view months older
   *  than their history window. Internal AnalyticsService callers bypass this. */
  private assertWithinHistory(tier: WorkspaceContext['tier'], from: string): void {
    const floor = earliestAllowedMonthStart(tier);
    if (floor && from.slice(0, 10) < floor) {
      throw new ForbiddenException({
        error: 'tier_limit',
        message: 'Viewing older months requires Pro.',
      });
    }
  }
```

Then at the top of each of `summary`, `byCategory`, `insight`, add:

```ts
    this.assertWithinHistory(workspace.tier, query.from);
```

(`WorkspaceContext` already carries `tier`; if the type import needs `SubscriptionTier`, it's re-exported from `@finby/shared` — but `workspace.tier` typed as-is is fine for the helper's `SubscriptionTier` param.)

- [ ] **Step 4: Run test + build**

Run: `pnpm --filter finby-api test -- analytics.controller` → PASS.
Run: `pnpm --filter finby-api build` → succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/analytics/analytics.controller.ts apps/api/src/modules/analytics/analytics.controller.spec.ts
git commit -m "feat(api): tier-gate dashboard month history (summary/by-category/insight)"
```

---

### Task 5: `@finby/core` dashboard-api methods (getByCategory / getTrend / getInsight)

**Files:**
- Modify: `packages/core/src/api/dashboard-api.ts`
- Test: `packages/core/src/api/dashboard-api.test.ts`

**Interfaces:**
- Consumes: `AuthedFetch`; shared `CategoryBreakdownResult`, `TrendResult`, `InsightResult`.
- Produces: `DashboardApi` gains
  - `getByCategory(workspaceId, from, to, type?: 'EXPENSE' | 'INCOME'): Promise<CategoryBreakdownResult>`
  - `getTrend(workspaceId, months?: number): Promise<TrendResult>`
  - `getInsight(workspaceId, from, to): Promise<InsightResult>`

- [ ] **Step 1: Write the failing test**

In `packages/core/src/api/dashboard-api.test.ts`, add (mirror the existing `getSummary`/`listRecentTransactions` test style — the file already stubs `authed` and asserts URL + unwrap):

```ts
  it('getByCategory builds the range+type query and returns the breakdown', async () => {
    const authed = vi.fn().mockResolvedValue({ breakdown: [{ category: { id: 'c1' } }], currency: 'USD' });
    const api = createDashboardApi(authed as never);
    await api.getByCategory('ws1', '2026-07-01', '2026-07-31', 'EXPENSE');
    expect(authed).toHaveBeenCalledWith(
      '/workspaces/ws1/analytics/by-category?from=2026-07-01&to=2026-07-31&type=EXPENSE',
    );
  });

  it('getTrend defaults months to 6', async () => {
    const authed = vi.fn().mockResolvedValue({ trend: [], currency: 'USD' });
    const api = createDashboardApi(authed as never);
    await api.getTrend('ws1');
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/analytics/trend?months=6');
  });

  it('getInsight builds the range query', async () => {
    const authed = vi.fn().mockResolvedValue({ direction: 'flat' });
    const api = createDashboardApi(authed as never);
    await api.getInsight('ws1', '2026-07-01', '2026-07-15');
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/analytics/insight?from=2026-07-01&to=2026-07-15');
  });
```

(If the test file imports `vi`/`createDashboardApi` differently, match the existing imports at the top of the file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @finby/core test -- dashboard-api`
Expected: FAIL — `api.getByCategory is not a function`.

- [ ] **Step 3: Extend the interface + factory**

In `packages/core/src/api/dashboard-api.ts`, update the import to add the new shared types:

```ts
import type {
  AccountView,
  BudgetView,
  CategoryBreakdownResult,
  InsightResult,
  SummaryResult,
  Transaction,
  TrendResult,
} from '@finby/shared';
```

Add to the `DashboardApi` interface:

```ts
  getByCategory(
    workspaceId: string,
    from: string,
    to: string,
    type?: 'EXPENSE' | 'INCOME',
  ): Promise<CategoryBreakdownResult>;
  getTrend(workspaceId: string, months?: number): Promise<TrendResult>;
  getInsight(workspaceId: string, from: string, to: string): Promise<InsightResult>;
```

Add to the returned object in `createDashboardApi` (alongside `getSummary`):

```ts
    getByCategory(workspaceId, from, to, type = 'EXPENSE') {
      const q = new URLSearchParams({ from, to, type });
      return authed<CategoryBreakdownResult>(
        `/workspaces/${workspaceId}/analytics/by-category?${q}`,
      );
    },
    getTrend(workspaceId, months = 6) {
      const q = new URLSearchParams({ months: String(months) });
      return authed<TrendResult>(`/workspaces/${workspaceId}/analytics/trend?${q}`);
    },
    getInsight(workspaceId, from, to) {
      const q = new URLSearchParams({ from, to });
      return authed<InsightResult>(`/workspaces/${workspaceId}/analytics/insight?${q}`);
    },
```

- [ ] **Step 4: Run test + build**

Run: `pnpm --filter @finby/shared build` (so core sees the new types), then `pnpm --filter @finby/core test -- dashboard-api` → PASS.
Run: `pnpm --filter @finby/core build` → succeeds.

- [ ] **Step 5: Full backend gate + commit**

Run:
```bash
pnpm --filter @finby/shared build
pnpm --filter @finby/core build
pnpm --filter finby-api build
pnpm --filter @finby/shared test
pnpm --filter @finby/core test
pnpm --filter finby-api test -- analytics insight
pnpm lint
```
Expected: all pass.

```bash
git add packages/core/src/api/dashboard-api.ts packages/core/src/api/dashboard-api.test.ts
git commit -m "feat(core): dashboard-api getByCategory/getTrend/getInsight"
```

---

## Self-Review

**Spec coverage (A1 scope):**
- New `analytics/insight` endpoint (pace projection + retrospective + edges) → Task 3. ✅
- `by-category` widened with icon/color → Task 2. ✅
- Tier history cap, server-enforced, 403 tier_limit → Task 4 (+ helper in Task 1). ✅
- Shared `InsightResult`, widened `CategoryBreakdownItem`, `TrendResult` + `analyticsHistoryMonths`/`earliestAllowedMonthStart` → Task 1. ✅
- Core `getByCategory`/`getTrend`/`getInsight` → Task 5. ✅
- (Mobile composition, charts, month selector, InsightCard → Plan A2, out of scope here.)

**Placeholder scan:** No TBD/TODO; every code step is complete. The keyword/message copy is fully materialized in `buildMessage`.

**Type consistency:** `InsightResult`/`CategoryBreakdownItem`/`TrendResult` are defined once in Task 1 (shared) and consumed with identical shapes by the API types (Task 2), `InsightService` (Task 3), and core (Task 5). `earliestAllowedMonthStart(tier, now?)` defined in Task 1, consumed in Task 4. `InsightService.insight(...)` signature defined in Task 3, called by the controller in the same task. The API `CategoryBreakdownItem` (Task 2) is widened to match the shared one (Task 1).
