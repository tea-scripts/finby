# Streak Repair — Design Spec

**Date:** 2026-06-14
**Status:** Approved (design) — pending implementation plan
**Author:** Tea + Claude

## Summary

Let **Pro-tier-and-above** users recover a single missed day so an at-risk
spending streak isn't lost. Eligibility is computed in the user's timezone;
a repair is allowed **once per calendar month**. The streak's day count is
preserved (continuity restored), not incremented — repair prevents a loss, it
does not grant a free day.

This ships the feature that the pricing cards already advertise with a
`[soon]` badge; that badge is removed from both repos as the final step.

## Goals

- Pro/Premium/Family users can repair a streak when exactly one day was missed,
  before the streak is actually lost.
- One repair per calendar month per user.
- The at-risk state is discoverable where the streak already lives (the app
  header `StreakBadge`), with a one-tap confirm.
- Free users see the at-risk state and an upgrade prompt (no repair).
- Single source of truth for the entitlement so API, web, and the plan
  compare table agree.

## Non-Goals

- No change to how streaks are earned/incremented (`onTransactionLogged`).
- No multi-day recovery, no "streak freeze" scheduling, no streak gifting.
- No chat-action repair card (possible future enhancement; out of scope).
- No per-tier variation in repair frequency (uniform once/month for all paid
  tiers).

## Background (current system)

- Streak state lives on `User`: `currentStreak Int`, `longestStreak Int`,
  `lastStreakDate String?` (a `YYYY-MM-DD` **local-date** string in the user's
  timezone). There is no per-day activity log.
  (`apps/api/prisma/schema.prisma`)
- `StreaksService.onTransactionLogged(userId)` updates the streak when a
  CONFIRMED transaction is created. It is idempotent per local day. A log is
  "consecutive" only when `lastStreakDate === previousLocalDate(today)`,
  otherwise `currentStreak` resets to `1`. `longestStreak` never decreases.
  (`apps/api/src/modules/streaks/streaks.service.ts`)
- Day math utilities, no external date lib:
  `localDayInfo(now, tz) -> { hour, date, startOfDayMs }` and
  `previousLocalDate('YYYY-MM-DD') -> 'YYYY-MM-DD'`.
  (`apps/api/src/modules/reminders/reminders.time.ts`)
- Tier gating is **per-workspace** via `@RequireTier('PRO')` + `TierGuard`,
  reading `request.workspace.tier`; rank `FREE(0) < PRO(1) < PREMIUM(2) <
  FAMILY(3)`. Entitlement flags live in `TIER_LIMITS`
  (`packages/shared/src/constants.ts`).
- `StreakBadge` is presentational, driven by the auth store's
  `user.currentStreak`. Rendered in `app-header.tsx` (size `sm`, always
  visible), `dashboard/page.tsx` (size `md`), and as text in
  `settings/preferences-section.tsx`.
- No repair / freeze / recover logic exists today.

Note: streaks are **per-user**; tier gating is **per-workspace**. The repair
endpoint is namespaced under a workspace (for the tier guard) but always acts
on the **requesting user's** streak. In a Family workspace each member has
their own streak and their own monthly repair allowance.

## Mechanic & eligibility

Let, in the user's timezone:

- `today = localDayInfo(now, tz).date`
- `yesterday = previousLocalDate(today)`
- `dayBeforeYesterday = previousLocalDate(yesterday)`

A streak is **at risk** (repairable) iff:

```
currentStreak >= 1
&& lastStreakDate === dayBeforeYesterday
```

Interpretation: the last logged day was the day before yesterday, **yesterday
was missed**, and **today has not been logged yet**. Logging today without a
repair would reset the streak to 1.

A repair performs:

```
lastStreakDate     = yesterday          // mark yesterday as "covered"
lastStreakRepairDate = today            // consume this month's allowance
// currentStreak and longestStreak are unchanged
```

After repair, the next CONFIRMED transaction today sees
`lastStreakDate (yesterday) === previousLocalDate(today)` → consecutive →
`currentStreak + 1`. So a 12-day streak stays at 12 through the repair and
becomes 13 on the next log.

### Why this window is "today-only"

- If the user already logged today after the gap, `onTransactionLogged` has
  reset the streak (`lastStreakDate === today`, `currentStreak === 1`), so the
  at-risk condition is false — not eligible. (Consistent with the chosen
  "save a single missed day, before it's lost" mechanic.)
- If two days lapse (`lastStreakDate` older than `dayBeforeYesterday`), the gap
  exceeds one day — not eligible.
- After a repair without a same-day log, the user becomes at-risk again the
  next day but `repairUsedThisMonth` is true, so it is not re-eligible until
  next calendar month.

## Frequency cap

**Once per calendar month**, in the user's timezone. Tracked by a single new
field rather than a counter + reset job:

```
User.lastStreakRepairDate String?   // YYYY-MM-DD local
```

```
repairUsedThisMonth =
  lastStreakRepairDate != null
  && lastStreakRepairDate.slice(0, 7) === today.slice(0, 7)
```

`repairEligible = atRisk && tierAllowsRepair && !repairUsedThisMonth`.

## Entitlement & gating

Add to `TierLimits` (`packages/shared/src/constants.ts`):

```ts
streakRepair: boolean;   // FREE: false, PRO/PREMIUM/FAMILY: true
```

- API: `POST .../streaks/repair` is guarded by
  `@UseGuards(WorkspaceMemberGuard, TierGuard)` + `@RequireTier('PRO')`.
- `GET .../streaks` is **not** tier-gated (free users may read their own
  status); it computes `tierAllowsRepair` from `TIER_LIMITS[workspace.tier]
  .streakRepair` to fill `repairEligible`.
- Web reads `TIER_LIMITS[tier].streakRepair` to decide repair vs upsell, and
  the PlanCard compare table gains a `streakRepair` row.

## API

New `StreaksController` (added to `StreaksModule`, which currently exports only
the service). Endpoints namespaced under the workspace.

### `GET /workspaces/:workspaceId/streaks`

Guards: `WorkspaceMemberGuard` (no tier guard). Acts on the requesting user.

Response `StreakStatusView`:

```ts
interface StreakStatusView {
  currentStreak: number;
  longestStreak: number;
  atRisk: boolean;               // exactly one day missed, not yet lost
  repairEligible: boolean;       // atRisk && tier>=PRO && !usedThisMonth
  repairUsedThisMonth: boolean;
}
```

### `POST /workspaces/:workspaceId/streaks/repair`

Guards: `WorkspaceMemberGuard`, `TierGuard`, `@RequireTier('PRO')`.

- Validates eligibility server-side (re-computes `atRisk` and
  `repairUsedThisMonth`; never trusts the client).
- On success: applies the mutation in a single conditional/transactional
  update (guards against double-tap races — a second concurrent call sees the
  consumed allowance and fails), returns the updated `StreakStatusView`.
- Errors (HTTP 409 `Conflict`, shaped like the existing `TIER_LIMIT` errors):
  - `{ error: 'STREAK_NOT_AT_RISK' }` — nothing to repair.
  - `{ error: 'STREAK_REPAIR_ALREADY_USED' }` — already repaired this month.
  - (403 `TIER_LIMIT` for sub-Pro is produced by `TierGuard`.)

### Service methods (`StreaksService`)

```ts
getStatus(userId: string, tier: SubscriptionTier): Promise<StreakStatusView>;
repair(userId: string): Promise<StreakStatusView>;   // throws on ineligible
```

Both resolve the local day with `localDayInfo(now, user.timezone || 'UTC')`,
falling back to `'UTC'` on an invalid timezone string (existing pattern).

## Web

- `apps/web/src/lib/streaks-api.ts` (mirrors `billing-api.ts`):
  `getStreakStatus(workspaceId)`, `repairStreak(workspaceId)`.
- The app shell (`app-header.tsx`) fetches streak status on mount and exposes
  it to the header `StreakBadge`. The badge:
  - Normal: unchanged.
  - **At risk**: distinct treatment (e.g. desaturated / ❄️ accent) and becomes
    a button.
    - Pro+ & eligible → small confirm ("Repair your 12-day streak? Uses your 1
      repair for June") → `repairStreak` → refetch status + sync auth store.
    - Free (or used this month with no allowance) → open `UpgradeModal`
      (`source: 'streak_repair'`) for FREE; for "already used" show a brief
      "Repair used for June" note.
- Refetch streak status after a repair and after chat streak updates
  (`chat/page.tsx` already updates `currentStreak`).
- Dashboard/settings badges may reflect the at-risk visual; the **header is
  the single action entry point** to keep the flow in one place.

The `StreakBadge` stays presentational; at-risk interactivity is added via new
optional props (e.g. `atRisk`, `onRepair`) so the three render sites opt in
without duplicating logic.

## Pricing follow-up (both repos)

Once the backend is built and gated:

1. `apps/web` PlanCard compare table: add a `streakRepair` (`✓`/`—`) row from
   `TIER_LIMITS`.
2. Remove the `badge: 'soon'` from the streak-repair feature in
   `apps/web/src/lib/plan-features.ts` **and** in
   `finby-landing/src/components/sections/PricingSection.tsx`.

## Testing

- **Shared:** `TIER_LIMITS` includes `streakRepair` per tier.
- **API service** (`streaks.service.spec.ts`, mirror existing): at-risk true
  only for a one-day gap; false for 0-gap, same-day, and ≥2-day gaps; monthly
  cap blocks a second repair in the same month and allows it next month;
  timezone resolves the day boundary; `repair` mutates `lastStreakDate`/
  `lastStreakRepairDate` and leaves `currentStreak`/`longestStreak` untouched;
  ineligible repair throws the right error.
- **API controller:** guard wiring — `POST repair` requires PRO+ (403 below
  Pro), `GET` does not.
- **Web (test-first):** `streaks-api` request shapes; `StreakBadge` at-risk
  rendering + button role; repair confirm → API call → refetch; FREE at-risk →
  `UpgradeModal` opens with `source: 'streak_repair'`.

## Edge cases

- Invalid `user.timezone` → treat as UTC (existing fallback).
- Double-tap / concurrent repair → conditional update consumes the allowance
  atomically; the loser gets `STREAK_REPAIR_ALREADY_USED`.
- Calendar-month boundary is evaluated in the user's timezone via
  `today.slice(0,7)`.
- `currentStreak === 0` / `lastStreakDate === null` → never at risk.
- Family workspace: repair acts on the requesting member's own streak and own
  monthly allowance; tier comes from the shared workspace.

## Rollout

Backend (schema + migration + service + controller + entitlement) and web
land together; the pricing `[soon]` → built swap is the last commit so the
cards never claim a feature that isn't live.
