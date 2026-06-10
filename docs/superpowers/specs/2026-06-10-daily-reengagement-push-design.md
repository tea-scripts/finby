# Daily Re-engagement Push — Design

**Date:** 2026-06-10
**Status:** Approved (pending implementation plan)
**Author:** brainstorming session

## Goal

Bring users back to Finby daily via Web Push notifications, delivered while the
app/browser is closed. Reach only users who haven't logged anything that day, in
their own local evening, with a personalized nudge — without burning the push
channel (over-sending → permission revocation / PWA uninstall).

## Context

The full Web Push pipeline already exists:

- `apps/web/public/sw.js` — service worker handling `push` + `notificationclick`
- `apps/web/src/lib/push.ts` — permission request + subscribe/unsubscribe (VAPID)
- `apps/api/src/modules/push/push.service.ts` — `web-push` fan-out, stores
  subscriptions keyed by endpoint, prunes dead (404/410) subscriptions, no-ops
  when VAPID is unconfigured
- `apps/api/src/modules/push/push.controller.ts` — vapid-public-key / subscribe /
  unsubscribe routes (scoped `workspaces/:workspaceId/push`)
- `pushSubscription` table (migration `20260604165258_add_push_subscriptions`)
- `env.schema.ts` — `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`
  (all optional; push disabled until set)
- `ScheduleModule.forRoot()` is wired (`app.module.ts:37`)

Today, push is fired **only** from `alerts.service.ts:95` (budget alerts), as a
fire-and-forget `void this.push?.sendToUser(...).catch(...)`.

Relevant data already present:

- `User.timezone` — IANA string (e.g. `Africa/Lagos`), default `UTC`
- `User.preferences` — `Json?` (place to store reminder settings, no migration)
- `Transaction.loggedByUserId` + `Transaction.createdAt` — activity signal
- `WorkspaceMember` — a user may belong to multiple workspaces

## Decisions (locked during brainstorming)

| Decision | Choice |
|----------|--------|
| **Targeting** | Only users who haven't logged a transaction today (their local day) |
| **Message** | Light personalization (display name + rotating copy variants) |
| **Timing** | Hourly cron; nudge users for whom it's ~20:00 (8pm) local |
| **Opt-in control** | Separate `dailyReminders` toggle, independent of budget alerts |
| **"Inactive" scope** | No transaction logged in **any** of the user's workspaces today |
| **Per-user dedup** | One nudge per user per day, across all devices/workspaces |

## Architecture

### Backend — `apps/api/src/modules/reminders/`

New module (mirrors `SubscriptionRemindersService` structure/conventions):

- `reminders.module.ts`
- `reminders.service.ts`
- `reminders.service.spec.ts`
- `reminders.copy.ts` — copy variants + variant selection

```
@Cron(CronExpression.EVERY_HOUR)
runHourlyReminderSweep()
```

Each hourly run:

1. **Timezone match** — determine which distinct user timezones are currently at
   ~20:00 local. Use `Intl.DateTimeFormat(tz, { hour: 'numeric', hour12: false })`
   on `new Date()`; cache per distinct tz so it's one computation per timezone,
   not per user.
2. **Candidate query** — users in a matched timezone where:
   - push is enabled (they have ≥1 `pushSubscription` row), AND
   - `preferences.notifications.dailyReminders !== false` (default-on), AND
   - `preferences.notifications.lastDailyReminderAt` is not today (idempotency —
     survives process restarts and any duplicate hourly hour-match).
3. **Inactivity check** — skip the user if any `Transaction` exists with
   `loggedByUserId = user.id` and `createdAt >= local midnight today`. (Local
   midnight derived from the user's timezone.)
4. **Send** — for inactive candidates, select a rotated copy variant, personalize
   with `displayName`, push, then stamp `lastDailyReminderAt = today`.

Stamping happens for **sent** nudges only. Users who were active simply aren't
stamped (cheap to re-evaluate next day; no spurious writes).

### New PushService method

```ts
sendToUserDevices(userId: string, payload: PushPayload): Promise<void>
```

Queries `pushSubscription` by `userId` alone (endpoint is globally unique), so a
user receives a single nudge regardless of how many workspaces/devices they have.
Reuses the existing 404/410 pruning logic. No-ops when VAPID is unconfigured,
consistent with `sendToUser`.

> Note: existing `pushSubscription` rows carry `workspaceId`. Querying by `userId`
> only is intentional for the user-level reminder. Subscriptions are still created
> per-workspace via the existing controller routes; this only changes the *read*
> side for reminders.

### Copy variants (`reminders.copy.ts`)

Evening-framed, rotated to avoid banner-blindness:

- `"{name}, spent anything today? Log it in 5 seconds 💸"`
- `"{name}, let's close out your day — what did you spend?"`
- `"Quick check-in: anything to log before bed, {name}?"`
- `"{name}, keeping today honest? Tap to log your spending."`

All open `url: '/chat'` (matches existing alert push + manifest `start_url`).
Variant selection: deterministic rotation (e.g. day-of-year modulo N) so a given
day is consistent and tests are deterministic.

### Data — `User.preferences` JSON (no migration)

```jsonc
{
  "notifications": {
    "dailyReminders": true,          // default-on once push enabled
    "lastDailyReminderAt": "2026-06-10" // ISO date, idempotency stamp
  }
}
```

Read defensively (preferences may be null or partially populated). A helper to
read/merge the `notifications` slice avoids clobbering other preference keys.

### Web — settings notifications section

In the existing settings page, a "Notifications" section with:

- **Enable notifications** — uses existing `enablePush()` / `disablePush()`
  (`apps/web/src/lib/push.ts`). Reflects `getPushState()`.
- **Daily reminder** — toggles `notifications.dailyReminders`. Disabled/greyed
  until push is enabled. Persisted via the user-preferences update path (confirm
  exact endpoint during planning; add a minimal `PATCH /me/preferences` only if
  none exists).

Budget alerts and the daily reminder are independently controllable: disabling
the reminder never disables alerts.

**iOS handling:** Web Push on iOS/iPadOS works only for an installed PWA. When the
page is running in iOS Safari *without* standalone display mode, show guidance
("Install Finby to your home screen to get reminders on iPhone") instead of a live
toggle. Detect via `matchMedia('(display-mode: standalone)')` /
`navigator.standalone`.

## Error handling

- Each cron pass wrapped in try/catch with `Logger` (matches
  `SubscriptionRemindersService.runDailyJob`).
- Per-user failures are caught and logged; one failure never aborts the sweep.
- Push remains fire-and-forget; 404/410 prune dead subscriptions.
- VAPID unconfigured → entire reminder path no-ops silently.

## Testing (Jest, mock-first / London school)

- Timezone hour-matching selects the correct users at 20:00 local; non-matching
  hours select none.
- "Inactive today" boundary correct at local midnight (active just after midnight
  local → skipped; last activity yesterday local → eligible).
- Idempotency: `lastDailyReminderAt = today` prevents a second send within the day.
- Opt-out: `dailyReminders === false` excludes the user; default-undefined includes.
- Multi-workspace dedup: a user in 2 workspaces, inactive in both, receives exactly
  one push.
- Active in one workspace today → not nudged (even if inactive in another).
- VAPID unset → no sends attempted.
- Copy variant selection is deterministic for a given day.

## Out of scope (YAGNI)

- Per-user custom reminder times (fixed 8pm local for v1).
- Streak tracking / streak-protection messaging.
- Budget-aware / data-driven message bodies.
- Multi-day win-back sequences.
- Email fallback for users without push.

## Files touched

**New**
- `apps/api/src/modules/reminders/reminders.module.ts`
- `apps/api/src/modules/reminders/reminders.service.ts`
- `apps/api/src/modules/reminders/reminders.service.spec.ts`
- `apps/api/src/modules/reminders/reminders.copy.ts`

**Modified**
- `apps/api/src/modules/push/push.service.ts` — add `sendToUserDevices`
- `apps/api/src/app.module.ts` — register `RemindersModule`
- Web settings page — Notifications section (+ daily-reminder toggle)
- User-preferences update path — only if a suitable endpoint doesn't already exist

**Config (deploy-time, not code)**
- Set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` in API env
  (`npx web-push generate-vapid-keys`). Without these the whole feature no-ops.
