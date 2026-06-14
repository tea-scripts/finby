# Streak Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Pro-tier-and-above users recover a single missed day (once per calendar month) so an at-risk spending streak isn't lost, surfaced via the at-risk `StreakBadge`.

**Architecture:** A new `streakRepair` entitlement flag in `@finby/shared` and a `User.lastStreakRepairDate` column drive a `StreaksService.getStatus`/`repair` pair exposed through a new `StreaksController` (`GET`/`POST` under the workspace, repair gated `@RequireTier('PRO')`). The web fetches live status in the app header, renders an at-risk badge, and confirms a repair (or shows the UpgradeModal for Free). Finally the pricing cards swap the streak-repair `[soon]` badge for the now-built feature.

**Tech Stack:** NestJS + Prisma + Jest (API), Next.js + Zustand + Vitest/Testing Library (web), shared TS package. pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-06-14-streak-repair-design.md`

---

## File Structure

**Create:**
- `apps/api/src/modules/streaks/streaks.types.ts` — `StreakStatusView` + error codes
- `apps/api/src/modules/streaks/streaks.controller.ts` — GET status / POST repair
- `apps/api/src/modules/streaks/streaks.controller.spec.ts` — delegation + gate metadata
- `apps/web/src/lib/streaks-api.ts` — `getStreakStatus`, `repairStreak`
- `apps/web/src/components/streak/StreakRepair.tsx` — header wrapper (fetch + confirm/upsell)
- `apps/web/src/components/streak/StreakRepair.test.tsx`

**Modify:**
- `packages/shared/src/constants.ts` — add `streakRepair` to `TierLimits` + 4 tiers
- `apps/api/prisma/schema.prisma` — add `User.lastStreakRepairDate`
- `apps/api/src/modules/streaks/streaks.service.ts` — `localToday`, `getStatus`, `repair`
- `apps/api/src/modules/streaks/streaks.service.spec.ts` — new tests
- `apps/api/src/modules/streaks/streaks.module.ts` — register controller
- `apps/web/src/lib/types.ts` — add `StreakStatus`
- `apps/web/src/components/streak/StreakBadge.tsx` — `atRisk`/`onClick` props
- `apps/web/src/components/streak/StreakBadge.test.tsx` — new tests
- `apps/web/src/components/app/app-header.tsx` — use `<StreakRepair />`
- `apps/web/src/components/billing/PlanCard.tsx` — compare-table `Streak repair` row
- `apps/web/src/lib/plan-features.ts` — drop streak-repair `[soon]` badge
- `apps/web/src/components/billing/UpgradeModal.test.tsx` — drop the `[soon]` assertion
- `finby-landing/src/components/sections/PricingSection.tsx` — drop streak-repair `[soon]` badge

---

## Task 1: Add `streakRepair` entitlement to shared constants

**Files:**
- Modify: `packages/shared/src/constants.ts`

- [ ] **Step 1: Add the field to the `TierLimits` interface**

In `packages/shared/src/constants.ts`, add to the `TierLimits` interface (after `receiptScansPerDay`):

```ts
  receiptScansPerDay: number;
  /** May recover one missed streak day per calendar month. */
  streakRepair: boolean;
```

- [ ] **Step 2: Set the value for every tier**

In the `TIER_LIMITS` map add `streakRepair` to each tier object:

- `FREE`: `streakRepair: false,`
- `PRO`: `streakRepair: true,`
- `PREMIUM`: `streakRepair: true,`
- `FAMILY`: `streakRepair: true,`

Place each line next to that tier's existing `receiptScansPerDay` line.

- [ ] **Step 3: Typecheck shared (and consumers via the API)**

Run: `pnpm --filter @finby/shared typecheck`
Expected: exits 0 (no output).

Run: `pnpm --filter @finby/shared build`
Expected: exits 0 — rebuilds `dist` so the API/web pick up the new field.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/constants.ts
git commit -m "feat(shared): add streakRepair tier entitlement"
```

---

## Task 2: Add `lastStreakRepairDate` column + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add the column to the `User` model**

In `apps/api/prisma/schema.prisma`, find the streak fields on `User`:

```prisma
  currentStreak     Int      @default(0)
  longestStreak     Int      @default(0)
  lastStreakDate    String?
```

Add one line directly below `lastStreakDate`:

```prisma
  currentStreak     Int      @default(0)
  longestStreak     Int      @default(0)
  lastStreakDate    String?
  // YYYY-MM-DD local date of the user's last streak repair (monthly cap).
  lastStreakRepairDate String?
```

- [ ] **Step 2: Ensure the database is running**

Run: `pnpm db:up`
Expected: docker compose starts Postgres/Redis (already-running is fine).

- [ ] **Step 3: Create + apply the migration (regenerates the Prisma client)**

Run: `pnpm --filter finby-api prisma:migrate -- --name add_last_streak_repair_date`
Expected: creates `apps/api/prisma/migrations/<timestamp>_add_last_streak_repair_date/migration.sql`, applies it, and regenerates the client. The SQL should be a single `ALTER TABLE "User" ADD COLUMN "lastStreakRepairDate" TEXT;`.

- [ ] **Step 4: Typecheck the API to confirm the client has the new field**

Run: `pnpm --filter finby-api typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): add User.lastStreakRepairDate for streak repair"
```

---

## Task 3: `StreaksService.getStatus` + day/eligibility helpers

**Files:**
- Create: `apps/api/src/modules/streaks/streaks.types.ts`
- Modify: `apps/api/src/modules/streaks/streaks.service.ts`
- Test: `apps/api/src/modules/streaks/streaks.service.spec.ts`

- [ ] **Step 1: Create the status view + error codes**

Create `apps/api/src/modules/streaks/streaks.types.ts`:

```ts
/** Live streak status for the requesting user. */
export interface StreakStatusView {
  currentStreak: number;
  longestStreak: number;
  /** Exactly one day was missed (yesterday) and the streak isn't lost yet. */
  atRisk: boolean;
  /** atRisk && tier allows repair && not already repaired this month. */
  repairEligible: boolean;
  repairUsedThisMonth: boolean;
}

/** Error codes returned by the repair endpoint (HTTP 409). */
export const STREAK_ERRORS = {
  NOT_AT_RISK: 'STREAK_NOT_AT_RISK',
  ALREADY_USED: 'STREAK_REPAIR_ALREADY_USED',
} as const;
```

- [ ] **Step 2: Write failing tests for `getStatus`**

In `apps/api/src/modules/streaks/streaks.service.spec.ts`, extend the `StreakUser` interface and `setup` helper, then add a `getStatus` describe block. First update the interface and setup near the top of the file:

```ts
interface StreakUser {
  timezone: string;
  currentStreak: number;
  longestStreak: number;
  lastStreakDate: string | null;
  lastStreakRepairDate: string | null;
}

function setup(user: StreakUser | null) {
  const update = jest.fn().mockResolvedValue({});
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const findUnique = jest.fn().mockResolvedValue(user);
  const prisma = { user: { findUnique, update, updateMany } } as unknown as PrismaService;
  const service = new StreaksService(prisma);
  return { service, update, updateMany, findUnique };
}
```

Every existing `setup({...})` call in this file must also gain `lastStreakRepairDate: null,` — add that line to each existing user literal.

Now append the new describe block at the end of the file:

```ts
describe('StreaksService.getStatus', () => {
  it('flags atRisk when exactly yesterday was missed (today not yet logged)', async () => {
    today('2026-06-12');
    const { service } = setup({
      timezone: 'UTC',
      currentStreak: 12,
      longestStreak: 12,
      lastStreakDate: '2026-06-10', // day before yesterday
      lastStreakRepairDate: null,
    });

    const status = await service.getStatus('u1', 'PRO');

    expect(status).toEqual({
      currentStreak: 12,
      longestStreak: 12,
      atRisk: true,
      repairEligible: true,
      repairUsedThisMonth: false,
    });
  });

  it('is not atRisk on a consecutive day (yesterday logged)', async () => {
    today('2026-06-12');
    const { service } = setup({
      timezone: 'UTC',
      currentStreak: 12,
      longestStreak: 12,
      lastStreakDate: '2026-06-11', // yesterday
      lastStreakRepairDate: null,
    });

    const status = await service.getStatus('u1', 'PRO');

    expect(status.atRisk).toBe(false);
    expect(status.repairEligible).toBe(false);
  });

  it('is not atRisk when two or more days were missed', async () => {
    today('2026-06-12');
    const { service } = setup({
      timezone: 'UTC',
      currentStreak: 12,
      longestStreak: 12,
      lastStreakDate: '2026-06-09', // 2-day gap
      lastStreakRepairDate: null,
    });

    const status = await service.getStatus('u1', 'PRO');

    expect(status.atRisk).toBe(false);
  });

  it('atRisk but not eligible for a FREE user', async () => {
    today('2026-06-12');
    const { service } = setup({
      timezone: 'UTC',
      currentStreak: 12,
      longestStreak: 12,
      lastStreakDate: '2026-06-10',
      lastStreakRepairDate: null,
    });

    const status = await service.getStatus('u1', 'FREE');

    expect(status.atRisk).toBe(true);
    expect(status.repairEligible).toBe(false);
  });

  it('atRisk but not eligible when already repaired this month', async () => {
    today('2026-06-12');
    const { service } = setup({
      timezone: 'UTC',
      currentStreak: 12,
      longestStreak: 12,
      lastStreakDate: '2026-06-10',
      lastStreakRepairDate: '2026-06-03', // same month
    });

    const status = await service.getStatus('u1', 'PRO');

    expect(status.atRisk).toBe(true);
    expect(status.repairUsedThisMonth).toBe(true);
    expect(status.repairEligible).toBe(false);
  });

  it('eligible again when the last repair was a previous month', async () => {
    today('2026-06-12');
    const { service } = setup({
      timezone: 'UTC',
      currentStreak: 12,
      longestStreak: 12,
      lastStreakDate: '2026-06-10',
      lastStreakRepairDate: '2026-05-30', // previous month
    });

    const status = await service.getStatus('u1', 'PRO');

    expect(status.repairUsedThisMonth).toBe(false);
    expect(status.repairEligible).toBe(true);
  });

  it('returns a zeroed status for a missing user', async () => {
    today('2026-06-12');
    const { service } = setup(null);

    const status = await service.getStatus('ghost', 'PRO');

    expect(status).toEqual({
      currentStreak: 0,
      longestStreak: 0,
      atRisk: false,
      repairEligible: false,
      repairUsedThisMonth: false,
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter finby-api test -- streaks.service`
Expected: FAIL — `service.getStatus is not a function`.

- [ ] **Step 4: Implement `getStatus` + helpers**

In `apps/api/src/modules/streaks/streaks.service.ts`, update the imports and add the methods. Change the imports at the top:

```ts
import { Injectable } from '@nestjs/common';
import { TIER_LIMITS, type SubscriptionTier } from '@finby/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { localDayInfo, previousLocalDate } from '../reminders/reminders.time';
import type { StreakStatusView } from './streaks.types';
```

Add these methods inside the `StreaksService` class (after `onTransactionLogged`):

```ts
  /** Resolve "today" as a YYYY-MM-DD local date in the user's timezone,
   *  falling back to UTC on an invalid timezone string. */
  private localToday(timezone: string | null): string {
    try {
      return localDayInfo(new Date(), timezone || 'UTC').date;
    } catch {
      return localDayInfo(new Date(), 'UTC').date;
    }
  }

  /** A streak is at risk when exactly yesterday was missed (last log was the
   *  day before yesterday) and today hasn't been logged yet. */
  private isAtRisk(currentStreak: number, lastStreakDate: string | null, today: string): boolean {
    if (currentStreak < 1 || !lastStreakDate) return false;
    const dayBeforeYesterday = previousLocalDate(previousLocalDate(today));
    return lastStreakDate === dayBeforeYesterday;
  }

  /** Whether a repair was already used in the current calendar month. */
  private usedThisMonth(lastStreakRepairDate: string | null, today: string): boolean {
    return !!lastStreakRepairDate && lastStreakRepairDate.slice(0, 7) === today.slice(0, 7);
  }

  /** Live streak status for the requesting user (un-gated; tier decides
   *  repairEligible so Free users can be shown an upsell). */
  async getStatus(userId: string, tier: SubscriptionTier): Promise<StreakStatusView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        timezone: true,
        currentStreak: true,
        longestStreak: true,
        lastStreakDate: true,
        lastStreakRepairDate: true,
      },
    });
    if (!user) {
      return {
        currentStreak: 0,
        longestStreak: 0,
        atRisk: false,
        repairEligible: false,
        repairUsedThisMonth: false,
      };
    }

    const today = this.localToday(user.timezone);
    const atRisk = this.isAtRisk(user.currentStreak, user.lastStreakDate, today);
    const repairUsedThisMonth = this.usedThisMonth(user.lastStreakRepairDate, today);

    return {
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
      atRisk,
      repairUsedThisMonth,
      repairEligible: atRisk && TIER_LIMITS[tier].streakRepair && !repairUsedThisMonth,
    };
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter finby-api test -- streaks.service`
Expected: PASS — all existing + new `getStatus` tests green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/streaks/streaks.types.ts apps/api/src/modules/streaks/streaks.service.ts apps/api/src/modules/streaks/streaks.service.spec.ts
git commit -m "feat(api): add StreaksService.getStatus with at-risk detection"
```

---

## Task 4: `StreaksService.repair`

**Files:**
- Modify: `apps/api/src/modules/streaks/streaks.service.ts`
- Test: `apps/api/src/modules/streaks/streaks.service.spec.ts`

- [ ] **Step 1: Write failing tests for `repair`**

Append to `apps/api/src/modules/streaks/streaks.service.spec.ts`:

```ts
describe('StreaksService.repair', () => {
  it('covers yesterday, stamps the repair date, and leaves the count untouched', async () => {
    today('2026-06-12');
    const { service, updateMany } = setup({
      timezone: 'UTC',
      currentStreak: 12,
      longestStreak: 15,
      lastStreakDate: '2026-06-10',
      lastStreakRepairDate: null,
    });

    const status = await service.repair('u1');

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', lastStreakDate: '2026-06-10' },
      data: { lastStreakDate: '2026-06-11', lastStreakRepairDate: '2026-06-12' },
    });
    expect(status).toEqual({
      currentStreak: 12,
      longestStreak: 15,
      atRisk: false,
      repairEligible: false,
      repairUsedThisMonth: true,
    });
  });

  it('throws NOT_AT_RISK when there is nothing to repair', async () => {
    today('2026-06-12');
    const { service, updateMany } = setup({
      timezone: 'UTC',
      currentStreak: 12,
      longestStreak: 12,
      lastStreakDate: '2026-06-11', // consecutive, not at risk
      lastStreakRepairDate: null,
    });

    await expect(service.repair('u1')).rejects.toMatchObject({
      response: { error: 'STREAK_NOT_AT_RISK' },
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('throws ALREADY_USED when a repair was already used this month', async () => {
    today('2026-06-12');
    const { service, updateMany } = setup({
      timezone: 'UTC',
      currentStreak: 12,
      longestStreak: 12,
      lastStreakDate: '2026-06-10',
      lastStreakRepairDate: '2026-06-02',
    });

    await expect(service.repair('u1')).rejects.toMatchObject({
      response: { error: 'STREAK_REPAIR_ALREADY_USED' },
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('throws NOT_AT_RISK when the guarded update loses a race (count 0)', async () => {
    today('2026-06-12');
    const { service, updateMany } = setup({
      timezone: 'UTC',
      currentStreak: 12,
      longestStreak: 12,
      lastStreakDate: '2026-06-10',
      lastStreakRepairDate: null,
    });
    updateMany.mockResolvedValue({ count: 0 });

    await expect(service.repair('u1')).rejects.toMatchObject({
      response: { error: 'STREAK_NOT_AT_RISK' },
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter finby-api test -- streaks.service`
Expected: FAIL — `service.repair is not a function`.

- [ ] **Step 3: Implement `repair`**

In `apps/api/src/modules/streaks/streaks.service.ts`, add `ConflictException` to the nest import and import the error codes:

```ts
import { ConflictException, Injectable } from '@nestjs/common';
```

```ts
import { STREAK_ERRORS, type StreakStatusView } from './streaks.types';
```

Add the method inside the class (after `getStatus`):

```ts
  /** Recover a single missed day. Caller (controller) enforces the PRO+ gate;
   *  this re-validates at-risk + the monthly cap and applies an atomic,
   *  state-guarded update so concurrent calls can't double-repair. */
  async repair(userId: string): Promise<StreakStatusView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        timezone: true,
        currentStreak: true,
        longestStreak: true,
        lastStreakDate: true,
        lastStreakRepairDate: true,
      },
    });

    const notAtRisk = new ConflictException({
      error: STREAK_ERRORS.NOT_AT_RISK,
      message: 'Your streak isn’t at risk right now.',
    });
    if (!user) throw notAtRisk;

    const today = this.localToday(user.timezone);
    if (!this.isAtRisk(user.currentStreak, user.lastStreakDate, today)) {
      throw notAtRisk;
    }
    if (this.usedThisMonth(user.lastStreakRepairDate, today)) {
      throw new ConflictException({
        error: STREAK_ERRORS.ALREADY_USED,
        message: 'You’ve already repaired a streak this month.',
      });
    }

    const yesterday = previousLocalDate(today);
    const dayBeforeYesterday = previousLocalDate(yesterday);

    // State-guarded update: only fires while last activity is still the day
    // before yesterday, so a concurrent repair/log can't double-apply.
    const res = await this.prisma.user.updateMany({
      where: { id: userId, lastStreakDate: dayBeforeYesterday },
      data: { lastStreakDate: yesterday, lastStreakRepairDate: today },
    });
    if (res.count === 0) throw notAtRisk;

    return {
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
      atRisk: false,
      repairUsedThisMonth: true,
      repairEligible: false,
    };
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter finby-api test -- streaks.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/streaks/streaks.service.ts apps/api/src/modules/streaks/streaks.service.spec.ts
git commit -m "feat(api): add StreaksService.repair with monthly cap + race guard"
```

---

## Task 5: `StreaksController` + module wiring

**Files:**
- Create: `apps/api/src/modules/streaks/streaks.controller.ts`
- Create: `apps/api/src/modules/streaks/streaks.controller.spec.ts`
- Modify: `apps/api/src/modules/streaks/streaks.module.ts`

- [ ] **Step 1: Write the failing controller test**

Create `apps/api/src/modules/streaks/streaks.controller.spec.ts`:

```ts
import 'reflect-metadata'; // so Reflect.getMetadata can read the @RequireTier decorator
import { REQUIRED_TIER_KEY } from '../../common/decorators/require-tier.decorator';
import { StreaksController } from './streaks.controller';
import type { StreaksService } from './streaks.service';
import type { StreakStatusView } from './streaks.types';
import type { WorkspaceContext } from '../../common/context';
import type { AuthUser } from '../auth/auth.types';

const VIEW: StreakStatusView = {
  currentStreak: 12,
  longestStreak: 12,
  atRisk: true,
  repairEligible: true,
  repairUsedThisMonth: false,
};

const workspace = { id: 'w1', tier: 'PRO' } as WorkspaceContext;
const user = { userId: 'u1', email: 'a@b.c' } as AuthUser;

function make() {
  const service = {
    getStatus: jest.fn().mockResolvedValue(VIEW),
    repair: jest.fn().mockResolvedValue(VIEW),
  };
  const controller = new StreaksController(service as unknown as StreaksService);
  return { controller, service };
}

describe('StreaksController', () => {
  it('getStatus delegates with the user id and workspace tier', async () => {
    const { controller, service } = make();
    await expect(controller.getStatus(workspace, user)).resolves.toBe(VIEW);
    expect(service.getStatus).toHaveBeenCalledWith('u1', 'PRO');
  });

  it('repair delegates with the user id', async () => {
    const { controller, service } = make();
    await expect(controller.repair(user)).resolves.toBe(VIEW);
    expect(service.repair).toHaveBeenCalledWith('u1');
  });

  it('the repair endpoint is gated to PRO and above', () => {
    const tier = Reflect.getMetadata(REQUIRED_TIER_KEY, StreaksController.prototype.repair);
    expect(tier).toBe('PRO');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter finby-api test -- streaks.controller`
Expected: FAIL — cannot find module `./streaks.controller`.

- [ ] **Step 3: Implement the controller**

Create `apps/api/src/modules/streaks/streaks.controller.ts`:

```ts
import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireTier } from '../../common/decorators/require-tier.decorator';
import { Workspace } from '../../common/decorators/workspace.decorator';
import { TierGuard } from '../../common/guards/tier.guard';
import { WorkspaceMemberGuard } from '../../common/guards/workspace-member.guard';
import type { WorkspaceContext } from '../../common/context';
import type { AuthUser } from '../auth/auth.types';
import { StreaksService } from './streaks.service';
import type { StreakStatusView } from './streaks.types';

@Controller('workspaces/:workspaceId/streaks')
@UseGuards(WorkspaceMemberGuard)
export class StreaksController {
  constructor(private readonly streaks: StreaksService) {}

  /** Live streak status for the requesting member. Not tier-gated — Free users
   *  read their own streak (and can be shown a repair upsell). */
  @Get()
  getStatus(
    @Workspace() workspace: WorkspaceContext,
    @CurrentUser() user: AuthUser,
  ): Promise<StreakStatusView> {
    return this.streaks.getStatus(user.userId, workspace.tier);
  }

  /** Recover one missed day. PRO+ only. */
  @Post('repair')
  @UseGuards(TierGuard)
  @RequireTier('PRO')
  repair(@CurrentUser() user: AuthUser): Promise<StreakStatusView> {
    return this.streaks.repair(user.userId);
  }
}
```

- [ ] **Step 4: Register the controller in the module**

Replace `apps/api/src/modules/streaks/streaks.module.ts` with:

```ts
import { Module } from '@nestjs/common';
import { StreaksController } from './streaks.controller';
import { StreaksService } from './streaks.service';

@Module({
  controllers: [StreaksController],
  providers: [StreaksService],
  exports: [StreaksService],
})
export class StreaksModule {}
```

- [ ] **Step 5: Run the test + typecheck**

Run: `pnpm --filter finby-api test -- streaks.controller`
Expected: PASS.

Run: `pnpm --filter finby-api typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/streaks/streaks.controller.ts apps/api/src/modules/streaks/streaks.controller.spec.ts apps/api/src/modules/streaks/streaks.module.ts
git commit -m "feat(api): expose streak status + repair endpoints"
```

---

## Task 6: Web streak-status types + API client

**Files:**
- Modify: `apps/web/src/lib/types.ts`
- Create: `apps/web/src/lib/streaks-api.ts`

- [ ] **Step 1: Add the `StreakStatus` type**

In `apps/web/src/lib/types.ts`, add near the other view types (e.g. after the `BillingPlan` interface):

```ts
export interface StreakStatus {
  currentStreak: number;
  longestStreak: number;
  atRisk: boolean;
  repairEligible: boolean;
  repairUsedThisMonth: boolean;
}
```

- [ ] **Step 2: Create the API client**

Create `apps/web/src/lib/streaks-api.ts` (mirrors `billing-api.ts`):

```ts
import { useAuth } from './store';
import type { StreakStatus } from './types';

function authed<T>(path: string, init?: RequestInit): Promise<T> {
  return useAuth.getState().authed<T>(path, init);
}

export function getStreakStatus(workspaceId: string): Promise<StreakStatus> {
  return authed<StreakStatus>(`/workspaces/${workspaceId}/streaks`);
}

export function repairStreak(workspaceId: string): Promise<StreakStatus> {
  return authed<StreakStatus>(`/workspaces/${workspaceId}/streaks/repair`, { method: 'POST' });
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter finby-web typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/types.ts apps/web/src/lib/streaks-api.ts
git commit -m "feat(web): add streak status API client"
```

---

## Task 7: `StreakBadge` at-risk / clickable variant

**Files:**
- Modify: `apps/web/src/components/streak/StreakBadge.tsx`
- Test: `apps/web/src/components/streak/StreakBadge.test.tsx`

- [ ] **Step 1: Write failing tests**

Append to `apps/web/src/components/streak/StreakBadge.test.tsx`:

```ts
it('renders as a button with an accessible repair label when atRisk + onClick', () => {
  const onClick = vi.fn();
  render(<StreakBadge streak={12} size="sm" atRisk onClick={onClick} />);
  const btn = screen.getByRole('button', { name: /streak at risk/i });
  expect(btn).toBeInTheDocument();
  fireEvent.click(btn);
  expect(onClick).toHaveBeenCalledTimes(1);
});

it('applies the at-risk treatment', () => {
  render(<StreakBadge streak={12} size="sm" atRisk onClick={() => {}} />);
  expect(screen.getByRole('button', { name: /streak at risk/i })).toHaveClass('ring-1');
});

it('renders a plain span (no button) when not atRisk', () => {
  render(<StreakBadge streak={12} size="sm" />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
```

Ensure the test file imports `vi` and `fireEvent` — update the top import if needed:

```ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter finby-web exec vitest run src/components/streak/StreakBadge.test.tsx`
Expected: FAIL — no button role found.

- [ ] **Step 3: Implement the props**

Replace `apps/web/src/components/streak/StreakBadge.tsx` with:

```tsx
/** Spending-streak badge. By default it hides at 0 so an empty streak never
 *  shows; pass `showZero` to render "🔥 0" as an always-visible indicator.
 *  `sm` is a compact "🔥 7" for tight spots (chat header / cards); `md` is the
 *  full label. From 7 days on it picks up a warm highlight. When `atRisk` is
 *  set the badge takes a warning ring; with `onClick` it renders as a button
 *  (the streak-repair entry point). */
export function StreakBadge({
  streak,
  size = 'md',
  showZero = false,
  atRisk = false,
  onClick,
}: {
  streak: number;
  size?: 'sm' | 'md';
  showZero?: boolean;
  atRisk?: boolean;
  onClick?: () => void;
}) {
  if (streak <= 0 && !showZero && !atRisk) return null;

  const highlight = streak >= 7;
  const label =
    size === 'sm'
      ? `🔥 ${streak}`
      : streak <= 0
        ? '🔥 0-day streak'
        : streak === 1
          ? '🔥 1-day streak — just getting started!'
          : streak >= 30
            ? `🔥 ${streak}-day streak — incredible!`
            : `🔥 ${streak}-day streak`;

  const tone =
    atRisk
      ? 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/40'
      : highlight
        ? 'bg-amber-500/15 text-amber-300'
        : 'bg-accent-soft text-accent';
  const className = `inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={className}
        aria-label={atRisk ? 'Streak at risk — repair it' : `Streak: ${streak} days`}
      >
        {label}
      </button>
    );
  }

  return <span className={className}>{label}</span>;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter finby-web exec vitest run src/components/streak/StreakBadge.test.tsx`
Expected: PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/streak/StreakBadge.tsx apps/web/src/components/streak/StreakBadge.test.tsx
git commit -m "feat(web): add at-risk clickable variant to StreakBadge"
```

---

## Task 8: `StreakRepair` wrapper + header wiring

**Files:**
- Create: `apps/web/src/components/streak/StreakRepair.tsx`
- Test: `apps/web/src/components/streak/StreakRepair.test.tsx`
- Modify: `apps/web/src/components/app/app-header.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/components/streak/StreakRepair.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StreakRepair } from './StreakRepair';

vi.mock('../../lib/streaks-api', () => ({
  getStreakStatus: vi.fn(),
  repairStreak: vi.fn(),
}));

// UpgradeModal pulls in its own store/api — stub it.
vi.mock('../billing/UpgradeModal', () => ({
  UpgradeModal: ({ open, source }: { open: boolean; source?: string }) =>
    open ? <div data-testid="upgrade-modal">{source}</div> : null,
}));

const setUser = vi.fn();
const state = { user: { currentStreak: 12, longestStreak: 12 }, workspace: { id: 'w1', tier: 'PRO' }, setUser };
vi.mock('../../lib/store', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useAuth: vi.fn((selector: any) => selector(state)),
}));

import { getStreakStatus, repairStreak } from '../../lib/streaks-api';

const mockGet = vi.mocked(getStreakStatus);
const mockRepair = vi.mocked(repairStreak);

beforeEach(() => {
  vi.clearAllMocks();
  state.workspace.tier = 'PRO';
});

describe('StreakRepair', () => {
  it('Pro + eligible: tapping the at-risk badge confirms and repairs', async () => {
    mockGet.mockResolvedValue({
      currentStreak: 12, longestStreak: 12, atRisk: true, repairEligible: true, repairUsedThisMonth: false,
    });
    mockRepair.mockResolvedValue({
      currentStreak: 12, longestStreak: 12, atRisk: false, repairEligible: false, repairUsedThisMonth: true,
    });

    render(<StreakRepair />);

    const badge = await screen.findByRole('button', { name: /streak at risk/i });
    fireEvent.click(badge);

    const repairBtn = await screen.findByRole('button', { name: /^repair$/i });
    fireEvent.click(repairBtn);

    await waitFor(() => expect(mockRepair).toHaveBeenCalledWith('w1'));
    await waitFor(() => expect(setUser).toHaveBeenCalledWith({ currentStreak: 12, longestStreak: 12 }));
  });

  it('Free + at-risk: tapping the badge opens the UpgradeModal', async () => {
    state.workspace.tier = 'FREE';
    mockGet.mockResolvedValue({
      currentStreak: 12, longestStreak: 12, atRisk: true, repairEligible: false, repairUsedThisMonth: false,
    });

    render(<StreakRepair />);

    const badge = await screen.findByRole('button', { name: /streak at risk/i });
    fireEvent.click(badge);

    await waitFor(() =>
      expect(screen.getByTestId('upgrade-modal')).toHaveTextContent('streak_repair'),
    );
    expect(mockRepair).not.toHaveBeenCalled();
  });

  it('not at risk: renders a plain badge with no button', async () => {
    mockGet.mockResolvedValue({
      currentStreak: 12, longestStreak: 12, atRisk: false, repairEligible: false, repairUsedThisMonth: false,
    });

    render(<StreakRepair />);

    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('w1'));
    expect(screen.queryByRole('button', { name: /streak at risk/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter finby-web exec vitest run src/components/streak/StreakRepair.test.tsx`
Expected: FAIL — cannot find module `./StreakRepair`.

- [ ] **Step 3: Implement the wrapper**

Create `apps/web/src/components/streak/StreakRepair.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { TIER_LIMITS } from '@finby/shared';
import { useAuth } from '@/lib/store';
import { getStreakStatus, repairStreak } from '@/lib/streaks-api';
import { StreakBadge } from '@/components/streak/StreakBadge';
import { UpgradeModal } from '@/components/billing/UpgradeModal';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import type { StreakStatus } from '@/lib/types';

/** Header streak badge with repair behaviour. Fetches live status; when the
 *  streak is at risk the badge becomes tappable: Pro+ eligible users confirm a
 *  repair, Free users see the UpgradeModal, and users who already repaired this
 *  month get an explanatory note. */
export function StreakRepair() {
  const user = useAuth((s) => s.user);
  const workspaceId = useAuth((s) => s.workspace?.id);
  const tier = useAuth((s) => s.workspace?.tier) ?? 'FREE';
  const setUser = useAuth((s) => s.setUser);

  const [status, setStatus] = useState<StreakStatus | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    getStreakStatus(workspaceId)
      .then((s) => {
        if (!cancelled && mounted.current) setStatus(s);
      })
      .catch(() => {
        /* ignore — badge falls back to the store streak */
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const streak = status?.currentStreak ?? user?.currentStreak ?? 0;
  const atRisk = status?.atRisk ?? false;
  const tierAllows = TIER_LIMITS[tier].streakRepair;

  function onBadgeClick() {
    setError(null);
    if (!status?.atRisk) return;
    if (!tierAllows) {
      setUpgradeOpen(true);
      return;
    }
    setConfirmOpen(true);
  }

  async function onRepair() {
    if (!workspaceId) return;
    setSubmitting(true);
    setError(null);
    try {
      const next = await repairStreak(workspaceId);
      if (mounted.current) {
        setStatus(next);
        setUser({ currentStreak: next.currentStreak, longestStreak: next.longestStreak });
        setConfirmOpen(false);
      }
    } catch {
      if (mounted.current) setError("Couldn't repair your streak. Please try again.");
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  }

  const eligible = status?.repairEligible ?? false;

  return (
    <>
      <StreakBadge
        streak={streak}
        size="sm"
        showZero
        atRisk={atRisk}
        onClick={atRisk ? onBadgeClick : undefined}
      />

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Repair your streak">
        {eligible ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              You missed a day. Repair your {streak}-day streak to keep it going? Uses your one
              repair for this month.
            </p>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
                Not now
              </Button>
              <Button variant="primary" loading={submitting} onClick={onRepair}>
                Repair
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              You’ve already used your streak repair this month. Your next repair unlocks next
              month.
            </p>
            <div className="flex justify-end">
              <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        initialTier="PRO"
        source="streak_repair"
      />
    </>
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter finby-web exec vitest run src/components/streak/StreakRepair.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire it into the header**

In `apps/web/src/components/app/app-header.tsx`, replace the import:

```tsx
import { StreakBadge } from '@/components/streak/StreakBadge';
```

with:

```tsx
import { StreakRepair } from '@/components/streak/StreakRepair';
```

and replace the badge line:

```tsx
          <StreakBadge streak={user?.currentStreak ?? 0} size="sm" showZero />
```

with:

```tsx
          <StreakRepair />
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter finby-web typecheck`
Expected: exits 0. (`user` may now be unused in the header — if typecheck flags it, remove the now-unused `const user = useAuth((s) => s.user);` line.)

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/streak/StreakRepair.tsx apps/web/src/components/streak/StreakRepair.test.tsx apps/web/src/components/app/app-header.tsx
git commit -m "feat(web): streak repair flow in the app header"
```

---

## Task 9: Pricing — compare-table row + drop the `[soon]` badge (app)

**Files:**
- Modify: `apps/web/src/components/billing/PlanCard.tsx`
- Modify: `apps/web/src/lib/plan-features.ts`
- Modify: `apps/web/src/components/billing/UpgradeModal.test.tsx`

- [ ] **Step 1: Add the compare-table row**

In `apps/web/src/components/billing/PlanCard.tsx`, find the `COMPARE_FEATURES` array and add a row after the `AI coaching` line:

```ts
  { feature: 'AI coaching', format: (l) => yesNo(l.proactiveCoaching) },
  { feature: 'Streak repair', format: (l) => yesNo(l.streakRepair) },
```

- [ ] **Step 2: Drop the `[soon]` badge from the feature model**

In `apps/web/src/lib/plan-features.ts`, change BOTH streak-repair entries (PRO and PREMIUM) from:

```ts
      { label: 'Streak repair', note: 'recover a missed day, once', badge: 'soon' },
```

to:

```ts
      { label: 'Streak repair', note: 'recover a missed day, once' },
```

- [ ] **Step 3: Remove the now-obsolete `[soon]` test**

In `apps/web/src/components/billing/UpgradeModal.test.tsx`, delete the whole test:

```ts
  it('flags streak repair with a [soon] badge while it is unbuilt', async () => {
    render(<UpgradeModal open onClose={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getAllByText('Streak repair').length).toBeGreaterThan(0),
    );
    expect(screen.getAllByText('soon').length).toBeGreaterThan(0);
  });
```

- [ ] **Step 4: Run the billing tests + typecheck**

Run: `pnpm --filter finby-web exec vitest run src/components/billing`
Expected: PASS (no more `soon` assertion).

Run: `pnpm --filter finby-web typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/billing/PlanCard.tsx apps/web/src/lib/plan-features.ts apps/web/src/components/billing/UpgradeModal.test.tsx
git commit -m "feat(web): mark streak repair as live on pricing cards"
```

---

## Task 10: Pricing — drop the `[soon]` badge (landing repo)

**Files:**
- Modify: `finby-landing/src/components/sections/PricingSection.tsx` (path: `../finby-landing` relative to this repo)

- [ ] **Step 1: Drop the `[soon]` badge**

In `/home/unicorn/Documents/finby-landing/src/components/sections/PricingSection.tsx`, change BOTH streak-repair entries (Pro and Premium) from:

```ts
      { label: "Streak repair", note: "recover a missed day, once", badge: "soon" },
```

to:

```ts
      { label: "Streak repair", note: "recover a missed day, once" },
```

- [ ] **Step 2: Typecheck + build the landing app**

Run: `cd /home/unicorn/Documents/finby-landing && npx tsc --noEmit`
Expected: exits 0.

Run: `cd /home/unicorn/Documents/finby-landing && npx next build`
Expected: build succeeds (exit 0).

- [ ] **Step 3: Commit (in the landing repo)**

```bash
git -C /home/unicorn/Documents/finby-landing add src/components/sections/PricingSection.tsx
git -C /home/unicorn/Documents/finby-landing commit -m "feat(pricing): mark streak repair as live"
```

---

## Task 11: Full verification

**Files:** none (verification only)

- [ ] **Step 1: API — full test suite + build**

Run: `pnpm --filter finby-api test`
Expected: all suites PASS.

Run: `pnpm --filter finby-api build`
Expected: exits 0.

- [ ] **Step 2: Web — billing + streak tests, typecheck, build**

Run: `pnpm --filter finby-web exec vitest run src/components/streak src/components/billing`
Expected: PASS.

Run: `pnpm --filter finby-web typecheck && pnpm --filter finby-web build`
Expected: both exit 0.

- [ ] **Step 3: Manual smoke (optional, requires running stack)**

1. `pnpm db:up`, start the API (`pnpm --filter finby-api dev`) and web (`pnpm --filter finby-web dev`).
2. As a Pro user whose `lastStreakDate` is two days ago with `currentStreak ≥ 1`, open the app: the header streak badge shows the at-risk ring and is tappable.
3. Tap → confirm → streak preserved; badge returns to normal; a second tap shows "already used this month".
4. As a Free user in the same state: tapping opens the UpgradeModal (source `streak_repair`).

- [ ] **Step 4: Push (ask first)**

Pushing to `main` on both repos is a separate, explicit step — confirm with the user, then:

```bash
git push origin main
git -C /home/unicorn/Documents/finby-landing push origin main
```

---

## Notes for the implementer

- **Day math is timezone-aware.** Never compute "today"/"yesterday" from a raw UTC `Date`; use the service's `localToday` + `previousLocalDate`. The streak strings are `YYYY-MM-DD` local dates.
- **The repair preserves the count.** A 12-day streak stays 12 through a repair and becomes 13 on the next logged transaction — do not add a free +1.
- **`TIER_LIMITS` is the single source of truth** for the entitlement (API guard rank, web upsell decision, compare table). Don't duplicate the Pro+ check as a literal.
- **No AI-attribution trailers** in commits (repo policy).
- **Scope note:** the header fetches streak status on mount and after a repair. Live re-fetch immediately after a chat-logged transaction (the spec's "refetch after chat streak updates") is intentionally deferred — the at-risk state is a midnight-driven, load-time concern, so it isn't worth cross-component plumbing in this iteration. Revisit if QA wants the at-risk ring to clear in-session the moment a transaction is logged.
