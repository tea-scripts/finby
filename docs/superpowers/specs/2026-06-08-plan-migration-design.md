# Plan Migration (In-app, Stripe) — Design

**Date:** 2026-06-08
**Status:** Approved (pending spec review)
**Area:** `apps/api` billing, `apps/web` billing UI

## Problem

Existing paid users cannot change plans inside Finby. `PlanCard`'s paid branch
shows only *Manage Billing* + a read-only *Compare plans* table; the plan picker
(`UpgradeModal`) renders only for FREE users. The checkout endpoint can't be
reused (it would spawn a second subscription). The only path today is the Stripe
Customer Portal, and even that mis-maps the tier: on `customer.subscription.updated`
the Stripe/Paystack adapters read the tier from `metadata.tier` (set at checkout,
not updated on a plan switch), so a portal Pro→Premium switch leaves the user on
PRO in our DB while paying for Premium.

## Goals

- Let an OWNER of a paid, Stripe-billed workspace switch between PRO / PREMIUM /
  FAMILY from inside the app.
- Upgrades take effect immediately (prorated). Downgrades take effect at period
  end (no refund; user keeps the tier they paid for).
- Fix the stale-`metadata.tier` mapping so tier always reflects what is billed.

## Non-goals (out of scope)

- Paystack / LemonSqueezy plan changes — Stripe only; other providers throw
  `NotSupported`.
- Annual / interval changes (monthly only, as today).
- Downgrade to FREE through this flow — that is cancellation, which already exists
  (`setCancelAtPeriodEnd`).

## Rules

- **Tier rank:** `PRO(1) < PREMIUM(2) < FAMILY(3)`. Direction = compare ranks.
- **Upgrade** (target rank > current): immediate via `subscriptions.update` with
  `proration_behavior: 'create_prorations'`; tier + workspace updated immediately.
- **Downgrade** (target rank < current): Stripe **Subscription Schedule** — phase 1
  keeps the current price until `currentPeriodEnd`, phase 2 switches to the target
  price. Tier flips at period end via webhook. Pending target stored locally for UI.
- **Seat guard:** reject a downgrade whose seat limit (PRO/PREMIUM = 1,
  FAMILY = 5) is below the workspace's current member count, with a clear
  "remove N members first" message. While a downgrade is pending, new invites are
  capped at the lower (pending) seat limit so the gap can't be re-opened.
- **Re-changing:** choosing a new target while a downgrade is pending re-schedules
  (or, if the new target is an upgrade, cancels the schedule and applies immediately).

## Architecture

### Stripe pricing note

Finby uses inline `price_data` (ad-hoc prices from `TIER_PRICING` in
`@finby/shared`), not pre-created Stripe Price IDs. Verified that Stripe
`22.2.0` accepts `price_data` in Subscription Schedule phase items, so Schedules
work without introducing Price IDs. `changePlanImmediately` and `scheduleDowngrade`
both build phase/item prices from `TIER_PRICING`.

### Backend (`apps/api`)

**Endpoint** — `POST /workspaces/:id/subscription/change-plan` body `{ tier }`
(zod `changePlanSchema`, paid tiers only). OWNER-only (billing permission, same
guard set as cancel/portal). Returns the updated `SubscriptionView`.

**`SubscriptionService.changePlan(workspaceId, targetTier)`**
1. Load subscription; require `billingProvider === 'STRIPE'` and a
   `stripeSubscriptionId`; else `BadRequestException`.
2. Reject `targetTier === currentTier` and `targetTier === 'FREE'`.
3. Compute direction via `TIER_RANK`.
4. **Seat guard** (downgrade only): if target seat limit < current accepted member
   count → `BadRequestException` with remaining-count message.
5. **Upgrade:** `provider.changePlanImmediately(subId, targetTier)`; then in a
   transaction update `subscription` (tier, status, `pendingTier`=null,
   `pendingTierEffectiveAt`=null, `stripeScheduleId`=null) and `workspace`
   (tier, maxMembers). Release any existing schedule first.
6. **Downgrade:** `provider.scheduleDowngrade(subId, targetTier, currentPeriodEnd)`
   → returns schedule id; store `pendingTier`, `pendingTierEffectiveAt`
   (= currentPeriodEnd), `stripeScheduleId`. Tier unchanged now.
7. Return `getSubscription`.

**Provider interface** (`BillingProvider`) gains:
- `changePlanImmediately(providerSubscriptionId, tier)` — Stripe: fetch the sub's
  item id, `subscriptions.update` with `items: [{ id, price_data }]`,
  `proration_behavior: 'create_prorations'`, and `metadata.tier` + the sub's
  `metadata` updated to the new tier (fixes the stale-metadata bug).
- `scheduleDowngrade(providerSubscriptionId, tier, effectiveAt)` — Stripe: create a
  schedule `from_subscription`, then update it with two phases (phase 1 current
  item ending at `effectiveAt`; phase 2 new `price_data` with `metadata.tier`).
  Returns `{ scheduleId }`.
- `releaseScheduledChange(scheduleId)` — Stripe: `subscriptionSchedules.release`.
- Non-Stripe providers throw `BadRequestException('Plan change not supported for
  this provider.')`.

**Webhook** — when phase 2 activates Stripe emits `customer.subscription.updated`
carrying the new `metadata.tier`. Existing `applyWebhookEvent` SUBSCRIPTION_UPDATED
path maps tier from metadata → updates `subscription.tier` + `workspace`. Extend
the upsert update to also clear `pendingTier`, `pendingTierEffectiveAt`,
`stripeScheduleId` whenever tier changes (the renewal/downgrade has been applied).

**Schema** (`Subscription`, additive migration):
```
pendingTier            SubscriptionTier?
pendingTierEffectiveAt DateTime?
stripeScheduleId       String?
```

**`getSubscription` / `SubscriptionView`** gains `pendingTier` and
`pendingTierEffectiveAt`.

**Invite seat enforcement** — where invites check `workspace.maxMembers`, when a
downgrade is pending use `min(currentMax, pendingTierMax)` so members can't be
added above the lower limit before the downgrade lands.

### Frontend (`apps/web`)

- `billing-api.ts`: `changePlan(workspaceId, tier)` → POST change-plan.
- `lib/types.ts`: `SubscriptionView` gains `pendingTier`, `pendingTierEffectiveAt`.
- `PlanCard` (paid branch): add a **Change plan** button that opens `UpgradeModal`
  in *manage* mode; render a **"Downgrades to {tier} on {date}"** banner when
  `pendingTier` is set.
- `UpgradeModal`: new optional `currentTier` prop → *manage* mode. Renders all paid
  tiers, badges the current one ("Current plan"), others selectable. On select,
  shows the effective note ("Upgrades now, prorated" / "Switches at period end on
  {date}") and a confirm button that calls `changePlan` instead of `startCheckout`.
  Free-tier behavior (checkout) unchanged.

## Error handling

- Non-Stripe / no subscription / no subId → `BadRequestException` (surfaced to UI).
- Same-tier or FREE target → `BadRequestException`.
- Seat guard → `BadRequestException` with remaining count; UI shows the message.
- Stripe API failure → propagated; UI shows a generic "couldn't change plan" error;
  no local DB mutation on failure (DB writes happen only after the Stripe call
  succeeds, inside the same handler).

## Testing

- **`subscription.service.spec`**: upgrade (immediate; provider called; DB tier +
  workspace updated; schedule released), downgrade (schedule created; `pendingTier`
  set; tier unchanged now), seat-guard block, invalid targets (same/FREE/non-Stripe),
  ranking helper; webhook applies pending tier and clears pending fields.
- **`stripe.provider.spec`**: `changePlanImmediately` (update params incl.
  proration + metadata), `scheduleDowngrade` (schedule create/update phase shapes),
  `releaseScheduledChange`.
- **Web**: `UpgradeModal` manage-mode (current badge, calls `changePlan`, effective
  note), `PlanCard` (Change plan button, pending-downgrade banner), `billing-api`
  (`changePlan` POST shape).

## Rollout

- Additive Prisma migration runs on deploy (`prisma migrate deploy`).
- Stripe Customer Portal remains available for payment-method / invoice management.
- No env changes (pricing stays inline via `TIER_PRICING`).
