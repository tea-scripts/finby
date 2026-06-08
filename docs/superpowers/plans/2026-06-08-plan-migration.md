# Plan Migration (In-app, Stripe) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an OWNER of a paid, Stripe-billed workspace switch between PRO / PREMIUM / FAMILY in-app — upgrades immediately (prorated), downgrades at period end (Stripe Subscription Schedule) — and fix the stale `metadata.tier` mapping.

**Architecture:** A new `changePlan` flow in `SubscriptionService` drives Stripe through three new `BillingProvider` methods (`changePlanImmediately`, `scheduleDowngrade`, `releaseScheduledChange`). Upgrades mutate our DB immediately; downgrades store a pending tier and let the existing webhook path apply the change when Stripe's schedule fires. The web `UpgradeModal` gains a "manage" mode that calls `changePlan` instead of checkout.

**Tech Stack:** NestJS, Prisma (Postgres), Stripe SDK 22, Next.js + React, Vitest (web), Jest (api).

**Conventions:** API tests `apps/api` → `npx jest <path>` (cwd `apps/api`). Web tests → `npx vitest run <path>` (cwd `apps/web`). Prisma client regen after schema edits: `npx prisma generate` (cwd `apps/api`). Commit messages: NO AI-attribution trailer (repo policy).

**Tier rank (used everywhere):** `PRO=1, PREMIUM=2, FAMILY=3`. Direction = compare target vs current.

---

## Task 1: Schema — pending-change columns

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `Subscription`)
- Create: `apps/api/prisma/migrations/20260608130000_add_plan_change_fields/migration.sql`

- [ ] **Step 1: Add columns to the Subscription model**

In `apps/api/prisma/schema.prisma`, inside `model Subscription`, directly after the
existing `renewalReminder3SentAt DateTime?` line, add:

```prisma
  // In-flight downgrade scheduled for period end (Stripe subscription schedule).
  pendingTier            SubscriptionTier?
  pendingTierEffectiveAt DateTime?
  stripeScheduleId       String?
```

- [ ] **Step 2: Write the migration SQL**

Create `apps/api/prisma/migrations/20260608130000_add_plan_change_fields/migration.sql`:

```sql
-- AlterTable: pending plan-downgrade scheduled for period end
ALTER TABLE "subscriptions" ADD COLUMN "pendingTier" "SubscriptionTier";
ALTER TABLE "subscriptions" ADD COLUMN "pendingTierEffectiveAt" TIMESTAMP(3);
ALTER TABLE "subscriptions" ADD COLUMN "stripeScheduleId" TEXT;
```

- [ ] **Step 3: Regenerate the Prisma client**

Run (cwd `apps/api`): `npx prisma generate`
Expected: "✔ Generated Prisma Client".

- [ ] **Step 4: Typecheck (no consumers yet, just confirm schema compiles)**

Run (cwd `apps/api`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260608130000_add_plan_change_fields
git commit -m "feat(billing): schema for pending plan changes"
```

---

## Task 2: Provider port + non-Stripe stubs + view type

**Files:**
- Modify: `apps/api/src/modules/billing/billing.types.ts`
- Modify: `apps/api/src/modules/billing/providers/paystack.provider.ts`
- Modify: `apps/api/src/modules/billing/providers/lemonsqueezy.provider.ts`

- [ ] **Step 1: Extend the `BillingProvider` interface and `SubscriptionView`**

In `apps/api/src/modules/billing/billing.types.ts`:

Add these three methods to the `BillingProvider` interface, after the
`cancelAtPeriodEnd(...)` line:

```ts
  /** Swap the subscription's price immediately, prorating the difference. */
  changePlanImmediately(
    providerSubscriptionId: string,
    tier: Exclude<SubscriptionTier, 'FREE'>,
  ): Promise<void>;
  /** Schedule a switch to a (lower) tier at period end. Returns the schedule id. */
  scheduleDowngrade(
    providerSubscriptionId: string,
    tier: Exclude<SubscriptionTier, 'FREE'>,
    effectiveAt: Date,
  ): Promise<{ scheduleId: string }>;
  /** Cancel a pending scheduled change. */
  releaseScheduledChange(scheduleId: string): Promise<void>;
```

Add two fields to the `SubscriptionView` interface:

```ts
  pendingTier: SubscriptionTier | null;
  pendingTierEffectiveAt: string | null;
```

- [ ] **Step 2: Add throwing stubs to Paystack + LemonSqueezy providers**

At the end of the `PaystackProvider` class body in
`apps/api/src/modules/billing/providers/paystack.provider.ts` (before the closing
`}`), add — and make sure `BadRequestException` is in the `@nestjs/common` import:

```ts
  changePlanImmediately(): Promise<void> {
    throw new BadRequestException('Plan change is not supported for this provider.');
  }
  scheduleDowngrade(): Promise<{ scheduleId: string }> {
    throw new BadRequestException('Plan change is not supported for this provider.');
  }
  releaseScheduledChange(): Promise<void> {
    throw new BadRequestException('Plan change is not supported for this provider.');
  }
```

Do the same at the end of the `LemonSqueezyProvider` class in
`apps/api/src/modules/billing/providers/lemonsqueezy.provider.ts` (add the same
three methods; ensure `BadRequestException` is imported from `@nestjs/common`).

- [ ] **Step 3: Typecheck — Stripe provider should now error (missing methods)**

Run (cwd `apps/api`): `npx tsc --noEmit`
Expected: errors that `StripeProvider` does not implement `changePlanImmediately`,
`scheduleDowngrade`, `releaseScheduledChange`, **and** that `SubscriptionView`
objects in `subscription.service.ts` are missing `pendingTier` /
`pendingTierEffectiveAt`. These are fixed in Tasks 3–4. (This confirms the
interface wiring; do not commit yet.)

---

## Task 3: Stripe provider — implement the three methods

**Files:**
- Modify: `apps/api/src/modules/billing/providers/stripe.provider.ts`
- Test: `apps/api/src/modules/billing/providers/stripe.provider.spec.ts`

- [ ] **Step 1: Write failing tests**

Create or append to `apps/api/src/modules/billing/providers/stripe.provider.spec.ts`.
If the file already exists, add this `describe` block; otherwise create the file
with this content:

```ts
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.schema';
import { StripeProvider } from './stripe.provider';

const config = { get: jest.fn(() => '') } as unknown as ConfigService<Env, true>;

function withStripe(stripe: Record<string, unknown>) {
  const provider = new StripeProvider(config);
  // Inject a mock Stripe client (the real one is created in the constructor).
  (provider as unknown as { stripe: unknown }).stripe = stripe;
  return provider;
}

describe('StripeProvider.changePlanImmediately', () => {
  it('updates the line item with new price_data, proration, and tier metadata', async () => {
    const update = jest.fn().mockResolvedValue({});
    const retrieve = jest.fn().mockResolvedValue({
      id: 'sub_1',
      items: { data: [{ id: 'si_1', price: { id: 'price_old' } }] },
      metadata: { workspaceId: 'w1', tier: 'PRO' },
    });
    const provider = withStripe({ subscriptions: { retrieve, update } });

    await provider.changePlanImmediately('sub_1', 'PREMIUM');

    expect(update).toHaveBeenCalledTimes(1);
    const [subId, params] = update.mock.calls[0];
    expect(subId).toBe('sub_1');
    expect(params.proration_behavior).toBe('create_prorations');
    expect(params.metadata).toEqual({ workspaceId: 'w1', tier: 'PREMIUM' });
    expect(params.items[0].id).toBe('si_1');
    expect(params.items[0].price_data.unit_amount).toBe(999); // PREMIUM
  });
});

describe('StripeProvider.scheduleDowngrade', () => {
  it('creates a schedule from the sub and appends a period-end phase for the new tier', async () => {
    const retrieve = jest.fn().mockResolvedValue({
      id: 'sub_1',
      schedule: null,
      items: { data: [{ id: 'si_1', price: { id: 'price_premium' }, quantity: 1 }] },
      metadata: { workspaceId: 'w1', tier: 'PREMIUM' },
    });
    const schedCreate = jest.fn().mockResolvedValue({
      id: 'sched_1',
      phases: [{ items: [{ price: 'price_premium', quantity: 1 }], start_date: 1000 }],
    });
    const schedUpdate = jest.fn().mockResolvedValue({});
    const provider = withStripe({
      subscriptions: { retrieve },
      subscriptionSchedules: { create: schedCreate, update: schedUpdate },
    });

    const effectiveAt = new Date('2026-07-07T00:00:00.000Z');
    const result = await provider.scheduleDowngrade('sub_1', 'PRO', effectiveAt);

    expect(result).toEqual({ scheduleId: 'sched_1' });
    expect(schedCreate).toHaveBeenCalledWith({ from_subscription: 'sub_1' });
    const [, params] = schedUpdate.mock.calls[0];
    expect(params.end_behavior).toBe('release');
    expect(params.phases).toHaveLength(2);
    expect(params.phases[0].end_date).toBe(Math.floor(effectiveAt.getTime() / 1000));
    expect(params.phases[1].items[0].price_data.unit_amount).toBe(499); // PRO
    expect(params.phases[1].metadata).toEqual({ workspaceId: 'w1', tier: 'PRO' });
  });
});

describe('StripeProvider.releaseScheduledChange', () => {
  it('releases the schedule', async () => {
    const release = jest.fn().mockResolvedValue({});
    const provider = withStripe({ subscriptionSchedules: { release } });
    await provider.releaseScheduledChange('sched_1');
    expect(release).toHaveBeenCalledWith('sched_1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (cwd `apps/api`): `npx jest src/modules/billing/providers/stripe.provider.spec.ts`
Expected: FAIL — methods not implemented.

- [ ] **Step 3: Implement the three methods**

In `apps/api/src/modules/billing/providers/stripe.provider.ts`, add a small price
helper near the top (after the `asId` function):

```ts
function priceData(tier: Exclude<SubscriptionTier, 'FREE'>) {
  const p = TIER_PRICING[tier];
  return {
    currency: p.currency.toLowerCase(),
    unit_amount: p.amountMinor,
    recurring: { interval: p.interval },
    product_data: { name: `Finby ${tier}` },
  };
}
```

Then add these methods inside the `StripeProvider` class (after `cancelAtPeriodEnd`):

```ts
  async changePlanImmediately(
    providerSubscriptionId: string,
    tier: Exclude<SubscriptionTier, 'FREE'>,
  ): Promise<void> {
    const sub = await this.stripe.subscriptions.retrieve(providerSubscriptionId);
    const itemId = sub.items.data[0]?.id;
    if (!itemId) {
      throw new ServiceUnavailableException('Subscription has no line item to update.');
    }
    await this.stripe.subscriptions.update(providerSubscriptionId, {
      items: [{ id: itemId, price_data: priceData(tier) }],
      proration_behavior: 'create_prorations',
      metadata: { ...(sub.metadata ?? {}), tier },
    });
  }

  async scheduleDowngrade(
    providerSubscriptionId: string,
    tier: Exclude<SubscriptionTier, 'FREE'>,
    effectiveAt: Date,
  ): Promise<{ scheduleId: string }> {
    const sub = await this.stripe.subscriptions.retrieve(providerSubscriptionId);
    const workspaceId = sub.metadata?.workspaceId ?? '';
    const schedule = await this.stripe.subscriptionSchedules.create({
      from_subscription: providerSubscriptionId,
    });
    const phase0 = schedule.phases[0];
    if (!phase0) {
      throw new ServiceUnavailableException('Stripe did not return a schedule phase.');
    }
    await this.stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: 'release',
      phases: [
        {
          items: phase0.items.map((i) => ({
            price: i.price as string,
            quantity: i.quantity ?? 1,
          })),
          start_date: phase0.start_date,
          end_date: Math.floor(effectiveAt.getTime() / 1000),
        },
        {
          items: [{ price_data: priceData(tier), quantity: 1 }],
          metadata: { workspaceId, tier },
        },
      ],
    });
    return { scheduleId: schedule.id };
  }

  async releaseScheduledChange(scheduleId: string): Promise<void> {
    await this.stripe.subscriptionSchedules.release(scheduleId);
  }
```

> Note: Stripe SDK call shapes are validated by the mocked tests above. Real
> end-to-end correctness (proration amounts, schedule firing) must be verified in
> Stripe test mode during staging QA — see Task 9.

- [ ] **Step 4: Run tests to verify they pass**

Run (cwd `apps/api`): `npx jest src/modules/billing/providers/stripe.provider.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/billing/billing.types.ts apps/api/src/modules/billing/providers
git commit -m "feat(billing): Stripe plan-change + schedule-downgrade provider methods"
```

---

## Task 4: SubscriptionService — `changePlan` + view + webhook clear

**Files:**
- Modify: `apps/api/src/modules/billing/subscription.service.ts`
- Test: `apps/api/src/modules/billing/subscription.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Append to `apps/api/src/modules/billing/subscription.service.spec.ts`. The file's
`buildPrisma()` mock must expose `workspaceMember.count`; add it. Find the
`buildPrisma` function and add `workspaceMember: { count: jest.fn().mockResolvedValue(1) }`
to the returned `client` object (alongside `subscription`, `workspace`).

Then add these tests:

```ts
describe('SubscriptionService.changePlan', () => {
  const paidSub = {
    workspaceId: 'w1',
    tier: 'PRO',
    status: 'ACTIVE',
    billingProvider: 'STRIPE',
    stripeSubscriptionId: 'sub_1',
    stripeScheduleId: null,
    currentPeriodEnd: new Date('2026-07-07T00:00:00.000Z'),
  };

  it('upgrades immediately: calls provider + updates tier and workspace', async () => {
    const prisma = buildPrisma();
    prisma.subscription.findUnique
      .mockResolvedValueOnce(paidSub) // changePlan load
      .mockResolvedValueOnce({ ...paidSub, tier: 'PREMIUM' }); // getSubscription reload
    prisma.workspace.findUnique.mockResolvedValue({ tier: 'PREMIUM' });
    const stripe = stripeMock();
    stripe.changePlanImmediately = jest.fn().mockResolvedValue(undefined);
    const service = build(prisma, stripe).service;

    await service.changePlan('w1', 'PREMIUM');

    expect(stripe.changePlanImmediately).toHaveBeenCalledWith('sub_1', 'PREMIUM');
    expect(prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'w1' },
        data: expect.objectContaining({
          tier: 'PREMIUM',
          pendingTier: null,
          pendingTierEffectiveAt: null,
          stripeScheduleId: null,
        }),
      }),
    );
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'w1' }, data: expect.objectContaining({ tier: 'PREMIUM' }) }),
    );
  });

  it('downgrades at period end: schedules and records pendingTier without changing tier now', async () => {
    const prisma = buildPrisma();
    prisma.subscription.findUnique
      .mockResolvedValueOnce({ ...paidSub, tier: 'FAMILY' })
      .mockResolvedValueOnce({ ...paidSub, tier: 'FAMILY' });
    prisma.workspaceMember.count.mockResolvedValue(1);
    const stripe = stripeMock();
    stripe.scheduleDowngrade = jest.fn().mockResolvedValue({ scheduleId: 'sched_1' });
    const service = build(prisma, stripe).service;

    await service.changePlan('w1', 'PRO');

    expect(stripe.scheduleDowngrade).toHaveBeenCalledWith('sub_1', 'PRO', paidSub.currentPeriodEnd);
    const data = prisma.subscription.update.mock.calls[0][0].data;
    expect(data.pendingTier).toBe('PRO');
    expect(data.pendingTierEffectiveAt).toEqual(paidSub.currentPeriodEnd);
    expect(data.stripeScheduleId).toBe('sched_1');
    expect(data.tier).toBeUndefined(); // tier NOT changed now
    expect(prisma.workspace.update).not.toHaveBeenCalled();
  });

  it('blocks a downgrade when members exceed the target seat limit', async () => {
    const prisma = buildPrisma();
    prisma.subscription.findUnique.mockResolvedValue({ ...paidSub, tier: 'FAMILY' });
    prisma.workspaceMember.count.mockResolvedValue(3); // PRO allows 1
    const service = build(prisma, stripeMock()).service;

    await expect(service.changePlan('w1', 'PRO')).rejects.toMatchObject({ status: 400 });
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it('rejects same-tier, FREE target, and non-Stripe subs', async () => {
    const prisma = buildPrisma();
    prisma.subscription.findUnique.mockResolvedValue(paidSub);
    const service = build(prisma, stripeMock()).service;
    await expect(service.changePlan('w1', 'PRO')).rejects.toMatchObject({ status: 400 }); // same tier

    prisma.subscription.findUnique.mockResolvedValue({ ...paidSub, billingProvider: 'PAYSTACK' });
    await expect(service.changePlan('w1', 'PREMIUM')).rejects.toMatchObject({ status: 400 }); // non-stripe
  });
});
```

> The `build(prisma, stripe)` helper already exists in this spec file and returns
> `{ service, ... }`. Confirm it does; if it returns the service directly, adapt
> the `.service` access accordingly.

- [ ] **Step 2: Run tests to verify they fail**

Run (cwd `apps/api`): `npx jest src/modules/billing/subscription.service.spec.ts`
Expected: FAIL — `changePlan` not a function.

- [ ] **Step 3: Implement**

In `apps/api/src/modules/billing/subscription.service.ts`:

Add the import for tier limits at the top (merge into the existing `@finby/shared`
import if present):

```ts
import { TIER_LIMITS, type SubscriptionTier } from '@finby/shared';
```

Add a rank constant after `const MONTH_MS = ...`:

```ts
const TIER_RANK: Record<Exclude<SubscriptionTier, 'FREE'>, number> = {
  PRO: 1,
  PREMIUM: 2,
  FAMILY: 3,
};
```

Update `getSubscription` to return the pending fields. In the no-subscription
fallback `return { ... }`, add:

```ts
      pendingTier: null,
      pendingTierEffectiveAt: null,
```

and in the real `return { ... }` add:

```ts
      pendingTier: sub.pendingTier as SubscriptionTier | null,
      pendingTierEffectiveAt: sub.pendingTierEffectiveAt
        ? sub.pendingTierEffectiveAt.toISOString()
        : null,
```

Add the `changePlan` method (place after `setCancelAtPeriodEnd`):

```ts
  async changePlan(
    workspaceId: string,
    targetTier: Exclude<SubscriptionTier, 'FREE'>,
  ): Promise<SubscriptionView> {
    const sub = await this.prisma.subscription.findUnique({ where: { workspaceId } });
    if (!sub || sub.billingProvider !== 'STRIPE' || !sub.stripeSubscriptionId) {
      throw new BadRequestException('No active Stripe subscription to change.');
    }
    const current = sub.tier as Exclude<SubscriptionTier, 'FREE'>;
    if (targetTier === current) {
      throw new BadRequestException('That is already your current plan.');
    }

    const provider = this.getProvider('STRIPE');
    const upgrading = TIER_RANK[targetTier] > TIER_RANK[current];

    if (upgrading) {
      // Cancel any pending downgrade, then switch immediately (prorated).
      if (sub.stripeScheduleId) {
        await provider.releaseScheduledChange(sub.stripeScheduleId);
      }
      await provider.changePlanImmediately(sub.stripeSubscriptionId, targetTier);
      await this.prisma.$transaction(async (txc) => {
        await txc.subscription.update({
          where: { workspaceId },
          data: {
            tier: targetTier,
            pendingTier: null,
            pendingTierEffectiveAt: null,
            stripeScheduleId: null,
          },
        });
        await txc.workspace.update({
          where: { id: workspaceId },
          data: { tier: targetTier, maxMembers: targetTier === 'FAMILY' ? 5 : 1 },
        });
      });
      return this.getSubscription(workspaceId);
    }

    // Downgrade: enforce seat limit, then schedule for period end.
    const seatLimit = TIER_LIMITS[targetTier].maxMembers;
    const memberCount = await this.prisma.workspaceMember.count({ where: { workspaceId } });
    if (memberCount > seatLimit) {
      throw new BadRequestException(
        `The ${targetTier} plan allows ${seatLimit} member${seatLimit === 1 ? '' : 's'}. Remove ${memberCount - seatLimit} before downgrading.`,
      );
    }

    const { scheduleId } = await provider.scheduleDowngrade(
      sub.stripeSubscriptionId,
      targetTier,
      sub.currentPeriodEnd,
    );
    await this.prisma.subscription.update({
      where: { workspaceId },
      data: {
        pendingTier: targetTier,
        pendingTierEffectiveAt: sub.currentPeriodEnd,
        stripeScheduleId: scheduleId,
      },
    });
    return this.getSubscription(workspaceId);
  }
```

In `applyWebhookEvent`, the main upsert's `update` block (the one that already
clears `renewalReminder7SentAt`/`renewalReminder3SentAt`) — add pending-clear so an
applied downgrade/renewal resets the pending state:

```ts
          renewalReminder7SentAt: null,
          renewalReminder3SentAt: null,
          pendingTier: null,
          pendingTierEffectiveAt: null,
          stripeScheduleId: null,
```

- [ ] **Step 4: Run tests to verify they pass**

Run (cwd `apps/api`): `npx jest src/modules/billing/subscription.service.spec.ts`
Expected: PASS (existing + 4 new).

- [ ] **Step 5: Typecheck**

Run (cwd `apps/api`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/billing/subscription.service.ts apps/api/src/modules/billing/subscription.service.spec.ts
git commit -m "feat(billing): changePlan (upgrade-now / downgrade-at-period-end) + webhook clear"
```

---

## Task 5: Controller endpoint + DTO

**Files:**
- Modify: `apps/api/src/modules/billing/dto/billing.schemas.ts`
- Modify: `apps/api/src/modules/billing/subscription.controller.ts`
- Test: `apps/api/src/modules/billing/subscription.controller.spec.ts` (create if absent)

- [ ] **Step 1: Add the DTO schema**

In `apps/api/src/modules/billing/dto/billing.schemas.ts`, append:

```ts
export const changePlanSchema = z.object({
  tier: z.enum(['PRO', 'PREMIUM', 'FAMILY']),
});
export type ChangePlanInput = z.infer<typeof changePlanSchema>;
```

- [ ] **Step 2: Write the failing controller test**

Create `apps/api/src/modules/billing/subscription.controller.spec.ts` (if it does
not exist) or add this test:

```ts
import { SubscriptionController } from './subscription.controller';
import type { SubscriptionService } from './subscription.service';

describe('SubscriptionController.changePlan', () => {
  it('delegates to SubscriptionService.changePlan with workspace id and tier', async () => {
    const subscriptions = { changePlan: jest.fn().mockResolvedValue({ tier: 'PREMIUM' }) };
    const controller = new SubscriptionController(subscriptions as unknown as SubscriptionService);

    const result = await controller.changePlan(
      { id: 'w1' } as never,
      { tier: 'PREMIUM' },
    );

    expect(subscriptions.changePlan).toHaveBeenCalledWith('w1', 'PREMIUM');
    expect(result).toEqual({ tier: 'PREMIUM' });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run (cwd `apps/api`): `npx jest src/modules/billing/subscription.controller.spec.ts`
Expected: FAIL — `controller.changePlan` not a function.

- [ ] **Step 4: Add the endpoint**

In `apps/api/src/modules/billing/subscription.controller.ts`:

Update the schema import:

```ts
import { checkoutSchema, changePlanSchema, type CheckoutInput, type ChangePlanInput } from './dto/billing.schemas';
```

Add this method after `checkout(...)`:

```ts
  @Post('change-plan')
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER')
  @UseGuards(RolesGuard)
  changePlan(
    @Workspace() workspace: WorkspaceContext,
    @Body(new ZodValidationPipe(changePlanSchema)) body: ChangePlanInput,
  ): Promise<SubscriptionView> {
    return this.subscriptions.changePlan(workspace.id, body.tier);
  }
```

- [ ] **Step 5: Run to verify it passes**

Run (cwd `apps/api`): `npx jest src/modules/billing/subscription.controller.spec.ts`
Expected: PASS.

- [ ] **Step 6: Full api suite + typecheck**

Run (cwd `apps/api`): `npx jest && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/billing/dto/billing.schemas.ts apps/api/src/modules/billing/subscription.controller.ts apps/api/src/modules/billing/subscription.controller.spec.ts
git commit -m "feat(billing): POST change-plan endpoint"
```

---

## Task 6: Web — types + API client

**Files:**
- Modify: `apps/web/src/lib/types.ts` (`SubscriptionView`)
- Modify: `apps/web/src/lib/billing-api.ts`
- Test: `apps/web/src/lib/billing-api.test.ts`

- [ ] **Step 1: Extend the web `SubscriptionView`**

In `apps/web/src/lib/types.ts`, add to the `SubscriptionView` interface:

```ts
  pendingTier: SubscriptionTier | null;
  pendingTierEffectiveAt: string | null;
```

- [ ] **Step 2: Write the failing API-client test**

In `apps/web/src/lib/billing-api.test.ts`, add `changePlan` to the import list and
add this test inside the file (after the `openPortal` describe):

```ts
describe('changePlan', () => {
  it('calls authed POST /workspaces/:id/subscription/change-plan with tier body', () => {
    mockAuthed.mockResolvedValue({ tier: 'PREMIUM' });
    changePlan('w1', 'PREMIUM');
    expect(mockAuthed).toHaveBeenCalledWith('/workspaces/w1/subscription/change-plan', {
      method: 'POST',
      body: JSON.stringify({ tier: 'PREMIUM' }),
    });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run (cwd `apps/web`): `npx vitest run src/lib/billing-api.test.ts`
Expected: FAIL — `changePlan` not exported.

- [ ] **Step 4: Implement `changePlan`**

In `apps/web/src/lib/billing-api.ts`, after `openPortal`, add:

```ts
export function changePlan(
  workspaceId: string,
  tier: Exclude<SubscriptionTier, 'FREE'>,
): Promise<SubscriptionView> {
  return authed<SubscriptionView>(`/workspaces/${workspaceId}/subscription/change-plan`, {
    method: 'POST',
    body: JSON.stringify({ tier }),
  });
}
```

(`SubscriptionTier` and `SubscriptionView` are already imported at the top of the
file; if `SubscriptionTier` is not, add it to the `./types` import.)

- [ ] **Step 5: Run to verify it passes**

Run (cwd `apps/web`): `npx vitest run src/lib/billing-api.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/types.ts apps/web/src/lib/billing-api.ts apps/web/src/lib/billing-api.test.ts
git commit -m "feat(web): changePlan API client + pending fields on SubscriptionView"
```

---

## Task 7: Web — UpgradeModal manage mode

**Files:**
- Modify: `apps/web/src/components/billing/UpgradeModal.tsx`
- Test: `apps/web/src/components/billing/UpgradeModal.test.tsx`

The modal gains an optional `currentTier` prop. When set, it is in *manage* mode:
the current tier shows a "Current plan" badge and a disabled button; selecting a
different tier shows an effective-date note and a confirm button that calls
`changePlan` (not checkout). When `currentTier` is undefined, behavior is unchanged
(free-tier checkout).

- [ ] **Step 1: Write failing tests**

In `apps/web/src/components/billing/UpgradeModal.test.tsx`, add `changePlan` to the
`vi.mock('../../lib/billing-api', ...)` factory (`changePlan: vi.fn()`), import it
(`import { getPlans, startCheckout, changePlan } from '../../lib/billing-api';` plus
`const mockChangePlan = vi.mocked(changePlan);`), and add:

```ts
it('manage mode: badges the current tier and switches via changePlan', async () => {
  mockGetPlans.mockResolvedValue({ plans: PLANS });
  mockChangePlan.mockResolvedValue({ tier: 'PREMIUM' } as never);
  render(<UpgradeModal open onClose={() => {}} currentTier="PRO" />);

  // current tier marked
  await waitFor(() => expect(screen.getByText(/current plan/i)).toBeInTheDocument());

  // switch to PREMIUM
  fireEvent.click(screen.getByRole('tab', { name: /premium/i }));
  fireEvent.click(screen.getByRole('button', { name: /switch|change|confirm/i }));

  await waitFor(() => expect(mockChangePlan).toHaveBeenCalledWith('w1', 'PREMIUM'));
});

it('manage mode: shows downgrade-at-period-end note for a lower tier', async () => {
  mockGetPlans.mockResolvedValue({ plans: PLANS });
  render(<UpgradeModal open onClose={() => {}} currentTier="FAMILY" />);
  fireEvent.click(screen.getByRole('tab', { name: /pro/i }));
  await waitFor(() => expect(screen.getByText(/at the end of your billing period/i)).toBeInTheDocument());
});
```

> `PLANS` is the existing fixture in this spec (PRO/PREMIUM/FAMILY). Confirm it
> includes all three tiers; if it only has PRO, extend it with PREMIUM and FAMILY
> entries mirroring the PRO shape so the tabs render.

- [ ] **Step 2: Run to verify they fail**

Run (cwd `apps/web`): `npx vitest run src/components/billing/UpgradeModal.test.tsx`
Expected: FAIL — no current-plan badge / changePlan not called.

- [ ] **Step 3: Implement manage mode**

In `apps/web/src/components/billing/UpgradeModal.tsx`:

Update imports:

```ts
import { getPlans, startCheckout, changePlan, openBillingUrl } from '@/lib/billing-api';
```

Add a `TIER_RANK` map near `TAB_LABELS`:

```ts
const TIER_RANK: Record<UpgradeTier, number> = { PRO: 1, PREMIUM: 2, FAMILY: 3 };
```

Add `currentTier` to props:

```ts
export interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  initialTier?: UpgradeTier;
  source?: string;
  currentTier?: UpgradeTier;
}
```

Destructure it: `export function UpgradeModal({ open, onClose, initialTier = 'PRO', source = 'unknown', currentTier }: UpgradeModalProps) {`

Add a manage-mode submit handler next to `handleUpgrade`:

```ts
  const manageMode = !!currentTier;
  const isCurrent = manageMode && selectedTier === currentTier;
  const isDowngrade =
    manageMode && !!currentTier && TIER_RANK[selectedTier] < TIER_RANK[currentTier];

  async function handleChangePlan() {
    if (!workspaceId) {
      setSubmitError('No workspace found. Please reload and try again.');
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      await changePlan(workspaceId, selectedTier);
      onClose();
    } catch {
      if (mountedRef.current) {
        setSubmitError("Couldn't change your plan. Please try again.");
      }
    } finally {
      if (mountedRef.current) {
        setSubmitting(false);
      }
    }
  }
```

In the title, use a conditional: change `title="Upgrade your plan"` to
`title={manageMode ? 'Change your plan' : 'Upgrade your plan'}`.

In the tab buttons, append a "Current plan" marker. Inside the `TAB_LABELS.map`,
after `{label}`, add:

```tsx
              {manageMode && currentTier === tier && (
                <span className="ml-1 text-[10px] opacity-80">• Current plan</span>
              )}
```

In the submit area, replace the single Button with manage-aware rendering:

```tsx
        {manageMode && isDowngrade && (
          <p className="text-center text-xs text-muted">
            Your plan switches to {selectedTier} at the end of your billing period.
          </p>
        )}
        {manageMode && !isDowngrade && !isCurrent && (
          <p className="text-center text-xs text-muted">
            Upgrades take effect immediately (prorated).
          </p>
        )}
        <Button
          variant="primary"
          loading={submitting}
          disabled={loading || !!error || submitting || isCurrent}
          onClick={manageMode ? handleChangePlan : handleUpgrade}
          className="w-full"
        >
          {!manageMode ? 'Start Upgrade' : isCurrent ? 'Current plan' : isDowngrade ? `Switch to ${selectedTier}` : `Upgrade to ${selectedTier}`}
        </Button>
```

- [ ] **Step 4: Run to verify they pass**

Run (cwd `apps/web`): `npx vitest run src/components/billing/UpgradeModal.test.tsx`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/billing/UpgradeModal.tsx apps/web/src/components/billing/UpgradeModal.test.tsx
git commit -m "feat(web): UpgradeModal manage mode (in-app plan switch)"
```

---

## Task 8: Web — PlanCard "Change plan" + pending banner

**Files:**
- Modify: `apps/web/src/components/billing/PlanCard.tsx`
- Test: `apps/web/src/components/billing/PlanCard.test.tsx`

- [ ] **Step 1: Write failing tests**

In `apps/web/src/components/billing/PlanCard.test.tsx`, the `UpgradeModal` is mocked
to render only `data-testid="upgrade-modal"` when `open`. Extend that mock to also
echo `currentTier` so we can assert manage mode:

Find `vi.mock('./UpgradeModal', ...)` and replace its factory with:

```ts
vi.mock('./UpgradeModal', () => ({
  UpgradeModal: ({ open, currentTier }: { open: boolean; currentTier?: string }) =>
    open ? <div data-testid="upgrade-modal">{currentTier ?? 'none'}</div> : null,
}));
```

Add these tests:

```ts
it('paid tier: "Change plan" opens the modal in manage mode', async () => {
  mockGetSubscription.mockResolvedValue({
    tier: 'PRO', status: 'ACTIVE', billingProvider: 'STRIPE',
    currentPeriodEnd: '2026-07-07T00:00:00.000Z', cancelAtPeriodEnd: false,
    pendingTier: null, pendingTierEffectiveAt: null,
  });
  render(<PlanCard />);
  await waitFor(() => expect(screen.getByRole('button', { name: /change plan/i })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /change plan/i }));
  await waitFor(() => expect(screen.getByTestId('upgrade-modal')).toHaveTextContent('PRO'));
});

it('shows a pending-downgrade banner when pendingTier is set', async () => {
  mockGetSubscription.mockResolvedValue({
    tier: 'FAMILY', status: 'ACTIVE', billingProvider: 'STRIPE',
    currentPeriodEnd: '2026-07-07T00:00:00.000Z', cancelAtPeriodEnd: false,
    pendingTier: 'PRO', pendingTierEffectiveAt: '2026-07-07T00:00:00.000Z',
  });
  render(<PlanCard />);
  await waitFor(() => expect(screen.getByText(/changes to pro/i)).toBeInTheDocument());
});
```

> Existing PlanCard tests build `SubscriptionView` objects without the new
> `pendingTier`/`pendingTierEffectiveAt` fields. Add `pendingTier: null,
> pendingTierEffectiveAt: null` to each existing `mockGetSubscription.mockResolvedValue`
> in this file so they satisfy the type. (Vitest is JS so it won't fail at runtime,
> but keep them consistent.)

- [ ] **Step 2: Run to verify they fail**

Run (cwd `apps/web`): `npx vitest run src/components/billing/PlanCard.test.tsx`
Expected: FAIL — no "Change plan" button / no banner.

- [ ] **Step 3: Implement**

In `apps/web/src/components/billing/PlanCard.tsx`, paid-tier branch:

Add state to open the modal in manage mode (reuse existing `upgradeOpen` state).
In the paid `return (...)`, inside the billing-info block, add a pending banner
after the `cancelAtPeriodEnd` paragraph:

```tsx
        {sub.pendingTier && sub.pendingTierEffectiveAt && (
          <p className="text-sm text-amber-400">
            Changes to {sub.pendingTier} on {formatDate(sub.pendingTierEffectiveAt)}.
          </p>
        )}
```

In the Manage-Billing block (Stripe only), add a "Change plan" button before
"Manage Billing":

```tsx
          <Button
            variant="ghost"
            onClick={() => setUpgradeOpen(true)}
            className="w-full sm:w-auto"
          >
            Change plan
          </Button>
```

At the end of the paid `return`, render the modal in manage mode (the paid branch
currently has no `UpgradeModal`; add it just before the closing `</section>` is not
valid since UpgradeModal is a sibling — instead wrap the paid return in a fragment).
Change the paid branch from `return ( <section> ... </section> );` to:

```tsx
  return (
    <>
      <section className="rounded-2xl border border-line bg-surface/60 p-5 shadow-card space-y-4">
        {/* ...existing paid content... */}
      </section>
      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        currentTier={sub.tier as 'PRO' | 'PREMIUM' | 'FAMILY'}
        source="settings_change_plan"
      />
    </>
  );
```

After the modal closes, refresh the subscription so the pending banner appears.
Change `onClose` to:

```tsx
        onClose={() => {
          setUpgradeOpen(false);
          if (workspace) {
            getSubscription(workspace.id).then(setSub).catch(() => {});
          }
        }}
```

- [ ] **Step 4: Run to verify they pass**

Run (cwd `apps/web`): `npx vitest run src/components/billing/PlanCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full web suite + typecheck + lint**

Run (cwd `apps/web`): `npx vitest run && npx tsc --noEmit`
Then (repo root): `npx eslint apps/web/src/components/billing apps/web/src/lib/billing-api.ts`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/billing/PlanCard.tsx apps/web/src/components/billing/PlanCard.test.tsx
git commit -m "feat(web): PlanCard change-plan entry + pending-downgrade banner"
```

---

## Task 9: Final verification

- [ ] **Step 1: API — full suite, typecheck, build**

Run (cwd `apps/api`): `npx jest && npx tsc --noEmit && npx nest build`
Expected: all green.

- [ ] **Step 2: Web — full suite, typecheck, build**

Run (cwd `apps/web`): `npx vitest run && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 3: Lint changed files**

Run (repo root):
`npx eslint apps/api/src/modules/billing apps/web/src/components/billing apps/web/src/lib/billing-api.ts`
Expected: clean.

- [ ] **Step 4: Manual QA checklist (Stripe test mode, staging — document, do not block merge)**

Record these to verify post-deploy with Stripe test keys:
- Pro→Premium: charged prorated difference now; tier flips immediately; dashboard shows Premium.
- Premium→Pro: no charge now; PlanCard shows "Changes to Pro on <date>"; at period end the schedule fires, webhook downgrades tier.
- Family→Pro with >1 member (once invites exist): blocked with seat message.
- Re-upgrade while a downgrade is pending: schedule released, immediate upgrade applied, banner cleared.

- [ ] **Step 5: Final commit (if any docs/cleanup)**

```bash
git add -A
git commit -m "chore(billing): plan-migration verification notes"
```

---

## Self-Review notes (author)

- **Spec coverage:** scope/rules → Task 4 (`changePlan` + ranking + seat guard);
  provider methods + metadata-bug fix → Task 3; schema → Task 1; webhook clear →
  Task 4 Step 3; endpoint → Task 5; getSubscription view → Task 4; frontend
  (api/types/modal/card) → Tasks 6–8; testing → each task + Task 9. Invite-cap
  explicitly deferred (no invite flow) per spec.
- **Type consistency:** `changePlan`, `changePlanImmediately`, `scheduleDowngrade`,
  `releaseScheduledChange`, `pendingTier`, `pendingTierEffectiveAt`,
  `stripeScheduleId`, `TIER_RANK` used identically across api + web tasks.
- **Known soft spot:** Stripe schedule call shapes are unit-tested via mocks only;
  real Stripe behavior is deferred to staging QA (Task 9 Step 4).
