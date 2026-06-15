# Day-0 Retention & Streak Calendar — Design

Date: 2026-06-15
Status: Approved (pending implementation plan)

## Problem

Most new users log a transaction once, never install the PWA, never grant push,
and drift away with no commitment formed. The original instinct was to *force*
PWA installation, but forcing install adds friction at the moment commitment is
weakest and is impossible to automate on iOS (no install API). The real problem
is **no return hook between day 0 and the point where existing re-engagement
kicks in**.

### What already exists (verified)

- **Daily reminder nudge** (`apps/api/src/modules/reminders/reminders.service.ts`)
  fires ~8pm local — but it is **push-only**. It bails when push is unconfigured
  (`if (!this.push) return;`) and only queries users who have a `PushSubscription`.
  No push subscription ⇒ no daily reminder.
- **7-day re-engagement** (`apps/api/src/modules/reminders/reengagement.service.ts`)
  — push-preferred with an **email fallback**, 30-day cooldown, fires ~7pm local.
  It *excludes brand-new signups* (created after the inactivity cutoff), so it does
  not cover the first week.
- **PWA install banner** (`apps/web/src/components/app/install-banner.tsx` +
  `install-sheet.tsx`) — dismissible soft nudge, Android one-tap / iOS guided
  Add-to-Home-Screen. Already live in `app/(app)/layout.tsx`.
- **Client push opt-in** (`apps/web/src/lib/push.ts`: `enablePush`, `getPushState`,
  `isPushSupported`; `components/chat/notif-toggle.tsx`) — full VAPID subscribe flow.
- **Streak** (`apps/api/src/modules/streaks/streaks.service.ts`) — starts at **1**
  on the first transaction; per local day in the user's timezone via `localDayInfo`.
  Stored as **aggregates only** on `User`: `currentStreak`, `longestStreak`,
  `lastStreakDate`, `lastStreakRepairDate`. There is **no per-day streak history table**.

### The gap

A browser-only user who logs once then drifts gets **nothing** between day 0 and
day 7: the daily reminder skips them (no push subscription) and re-engagement only
fires after 7 days of total silence (then once a month). This is exactly the
"no commitment yet" cohort.

## Goals

- Give day-0 users a reason and a reminder to come back, **without** forcing a PWA install.
- Convert high-intent users (those who just logged their first transaction) into a
  reminder channel at the moment of value.
- Visualize the streak history so the habit is reinforced (explicitly requested by a user).

## Non-goals

- Forcing or gating the app behind PWA installation.
- Distributed job queue / BullMQ migration (out of scope; current in-process cron is fine at this scale).
- Full historical streak-repair accuracy in the calendar (see Limitations / Route 2, deferred).

---

## Part A — Early-life email reminders (server)

**New service:** `EarlyReminderService` in `apps/api/src/modules/reminders/`
(sibling to `reengagement.service.ts`), hourly `@Cron`, fires at each user's local ~8pm.

A user is targeted only when **all** hold:

- `createdAt` is within the **first 7 days** (precisely fills the gap *before* the
  existing 7-day re-engagement takes over — no overlap, no double-emailing).
- The user has **no `PushSubscription`** (push users already get the daily push nudge).
- `emailVerified === true` and `preferences.dailyReminders !== false`.
- The user **hasn't logged a transaction today** (so habit-forming users get nothing;
  the nudge self-limits to exactly who needs it).
- Cadence cap: at most one **every other day**, tracked via a new
  `preferences.lastEarlyReminderAt` stamp ⇒ max ~3–4 emails across the week,
  tapering as the user converts.

**Email:** new streak-aware template in
`apps/api/src/modules/email/email.templates.ts` ("You're on day {streak} 🔥 — log
today to keep it going"), deep-linked to `/chat`. Reuses `EmailService` / Resend.

**Handoff:** after day 7, the existing re-engagement system (inactivity-based) owns
the user. The first-7-days window guarantees no double-send with re-engagement.

## Part B — Day-0 commitment hook (web)

**New component:** `StreakStartPrompt`, shown **once**, right after the user logs
their **first** transaction. The chat flow already receives `currentStreak` back
from the transaction response (`transactions.service.ts` surfaces it).

**Gating — show only when all hold:**

- `currentStreak === 1`, **and**
- push isn't already on (`getPushState() !== 'on'`), **and**
- a `localStorage` "shown" flag isn't set.

Shows at most once.

**Behavior:**

- **Push-capable browser** (Android/Chrome/desktop): celebratory card — "🔥 You
  started a streak! Don't lose it — turn on reminders." Primary action calls
  `enablePush(workspace.id)`. Dismissible.
- **iOS Safari tab** (`isIosSafariTab`): push requires install first, so the primary
  action opens the existing `InstallSheet` (Add to Home Screen), with copy explaining
  reminders come after installing.

Reuses all existing push + install plumbing; this is a presentational component plus
a trigger hook in the chat transaction-logged path.

## Part C — Streak calendar (Route 1, derive-on-read)

**New endpoint:** `GET /workspaces/:workspaceId/streaks/calendar` (existing streaks
controller/service).

- Pulls the requesting user's transaction `createdAt`s over a window
  (**default: last 6 months**) and buckets each into a local day via the existing
  `localDayInfo(createdAt, timezone)` — the *same* helper the streak uses, so the
  calendar and the streak number always agree.
- Uses `createdAt` (not the user-editable `transactionDate`), matching streak semantics.
- Keyed on `userId` (`loggedByUserId`), matching how the streak is scoped.
- Returns: `{ from, to, activeDays: string[], repairedDays: string[] }`
  (`activeDays` = local YYYY-MM-DD with ≥1 transaction; `repairedDays` = the latest
  repair from `lastStreakRepairDate` when it lands in range).

**New web component:** `StreakCalendar` — a heatmap/calendar grid built with our own
UI primitives (per CLAUDE.md; no native controls). Fills `from→to`, painting each day
**active** / **repaired** / **missed**, future days blank. Header shows current/longest
streak + a legend.

**Placement:** expand the streak block in Settings (`preferences-section.tsx`) to host
the calendar, and make the header streak chip (`StreakRepair`) open it.

## Data model

No schema change. All three parts reuse existing tables/fields:

- Part A: new `preferences.lastEarlyReminderAt` (JSON key, no migration), reuses
  `User.createdAt`, `PushSubscription`, `Transaction.createdAt`.
- Part B: client-only state (`localStorage`) + existing push endpoints.
- Part C: derived from `Transaction.createdAt` + `User.lastStreakRepairDate`.

## Testing (test-first, per CLAUDE.md)

- **A:** unit-test `EarlyReminderService` targeting logic — first-7-days window,
  no-push, no-transaction-today, every-other-day cadence cap, local-hour gating,
  preference/verified gates — mirroring `reengagement.service` tests. Template snapshot.
- **B:** Vitest/RTL for `StreakStartPrompt` — gating (streak ≠ 1, push already on,
  already-shown), push path calls `enablePush`, iOS path opens `InstallSheet`.
- **C:** server bucketing (timezone correctness, repair inclusion, window bounds,
  empty history) + `StreakCalendar` render tests (active/missed/repaired/future, empty).

## Decisions / defaults (easy to change)

- Early-life window: **7 days**.
- Early-life email cadence: **every other day** (max ~3–4 in the week).
- Calendar window: **last 6 months**.
- Calendar placement: **Settings streak block + header streak chip**.

## Limitations (carried from the data model)

- **Repaired days:** only the *most recent* repair is stored
  (`lastStreakRepairDate`), so older repaired days would read as "missed". Full
  historical repair accuracy needs a `StreakDay` table (Route 2) — deferred.
- **Pre-streak history:** transactions logged before the streak feature still light
  up as active days (truthful logging activity; noted for expectations).
- **Timezone changes:** historical bucketing uses the user's *current* timezone, so a
  timezone change slightly shifts past buckets — consistent with how the streak itself
  would recompute; acceptable.

## Rollout / sequencing

The three parts are independent and can ship in any order:
1. Part C (read-only, lowest risk) — visible win, no behavior change.
2. Part B (client-only, reuses push/install plumbing).
3. Part A (new server cron + email; gated, self-limiting).
