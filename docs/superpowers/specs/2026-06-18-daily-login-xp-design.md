# Daily Login XP — Design

**Date:** 2026-06-18
**Status:** Approved (pending spec review)

## Problem

XP is currently earned only when a user logs a transaction (the `STREAK_DAY`
event, fired from `streaks.service.onTransactionLogged`). Many users do not have
a transaction to log every day, so they earn nothing on those days. We want
every user, on every plan, to earn XP simply for opening the app each day.

## Goal

Award daily XP to a user the first time they are active in the app on a given
local calendar day — independent of whether they log a transaction.

- **Amount:** scaled by plan, reusing the existing tier multiplier
  (Free 1 / Pro 3 / Premium·Family 5), consistent with how transaction-streak
  XP already scales.
- **Frequency:** at most once per user per local calendar day.
- **Independent of the spending streak:** logging in and logging a transaction
  can both award XP on the same day.

## Existing system (context)

- `xp.service.awardXp(userId, tier, event, meta?)`
  (`apps/api/src/modules/gamification/xp.service.ts`) is the single entry point
  for granting XP. It computes `delta = XP_BASE[event] * XP_MULTIPLIER[tier]`,
  writes an `XpTransaction` ledger row, and upserts the `UserXp` running total —
  all inside one Prisma transaction.
- `XP_BASE` lives in
  `apps/api/src/modules/gamification/xp.constants.ts`; tier multipliers in
  `packages/shared/src/constants.ts` (`TIER_LIMITS.xpMultiplier`).
- Data model (`apps/schema.prisma`): `UserXp` (balance + totalEarned),
  `XpTransaction` (immutable ledger, `event`/`delta`/`meta`), `XpEvent` enum.
- `AuthService.getMe()` (`apps/api/src/modules/auth/auth.service.ts`) backs
  `GET /auth/me`. The frontend calls it after login and on every app re-open /
  session restore, so it sees users with persistent sessions. Tier is resolved
  there from workspace membership.
- `User.lastStreakDate` is a `YYYY-MM-DD` local-date string used by the
  transaction streak; `localDayInfo(now, timezone)`
  (`apps/api/.../reminders.time.ts`) resolves an instant to a local date.
- `User.lastLoginAt` is a `DateTime` set only on explicit `POST /auth/login` and
  consumed by admin analytics — it is **not** reused for this feature.

## Design

### Trigger point

Award from `AuthService.getMe()` — the single chokepoint for "user opened the
app today." It is hit both immediately after login and on session restore, so
users who stay logged in (typical on mobile) still earn the daily reward, which
`POST /auth/login` alone would miss.

A new gamification method `awardDailyLoginXp(userId, tier, now)` is called from
`getMe()`. This follows the existing transactions→streaks coupling pattern.

The call is **best-effort**: wrapped in `try/catch` so a gamification failure is
logged and swallowed — it must never break authentication. `getMe()` still
returns the user view.

### Data model changes

1. **`XpEvent` enum:** add `DAILY_LOGIN`.
2. **`XP_BASE`:** `DAILY_LOGIN: 1` (scaled by tier multiplier through the normal
   `awardXp` path).
3. **`User` model:** add `lastDailyXpDate String?` — `YYYY-MM-DD` local-date
   string, mirroring `lastStreakDate`. This is the idempotency key.
4. **Prisma migration** for the new column and enum value. No changes to
   `UserXp` / `XpTransaction` shapes.

### Idempotency & race safety

Resolve today's local date with `localDayInfo(now, user.timezone)`. Guard
against a double-award from two concurrent `/auth/me` requests with a single
conditional atomic write:

```ts
const { count } = await prisma.user.updateMany({
  where: { id: userId, lastDailyXpDate: { not: today } },
  data: { lastDailyXpDate: today },
});
if (count === 1) {
  await xp.awardXp(userId, tier, XpEvent.DAILY_LOGIN);
}
```

Only the request that actually flipped `lastDailyXpDate` proceeds to award XP;
all other same-day requests see `count === 0` and do nothing. The `XpTransaction`
row is the audit trail.

## Error handling

- The whole daily-login award is best-effort inside `getMe()`; exceptions are
  caught and logged, never propagated.
- `awardXp` remains transactional, so a partial award (ledger without balance
  update, or vice versa) cannot occur.

## Testing

- **Daily-login award logic:**
  - awards tier-scaled XP on the first activity of a local day;
  - second activity the same local day is a no-op (no ledger row, no balance
    change);
  - a new local day awards again;
  - timezone boundary is respected via `localDayInfo`;
  - independent of the transaction streak.
- **`auth.service.getMe`:**
  - invokes the daily-login award;
  - still returns the user view when the award throws.

## Out of scope (YAGNI)

- Daily-login streaks or milestone bonuses (separate from the existing
  transaction streak).
- Achievements tied to daily logins.
- Backfilling XP for past days.
