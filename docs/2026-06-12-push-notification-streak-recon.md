# Push Notification & Streak Recon Report

## 1. Push notification infrastructure

The system is **fully built and wired** — this is not greenfield. There's a dedicated `push` module plus two existing consumers (`reminders` cron, `alerts` budget events).

### Files found

**API**
| File | What it does |
|---|---|
| `apps/api/src/modules/push/push.service.ts` | Core delivery. Configures VAPID, stores subscriptions, fans out via `webpush.sendNotification()`, prunes dead (404/410) endpoints. |
| `apps/api/src/modules/push/push.controller.ts` | REST: `GET vapid-public-key`, `POST subscribe`, `POST unsubscribe` under `/workspaces/:workspaceId/push`. |
| `apps/api/src/modules/push/dto/push.schemas.ts` | Zod schemas for subscribe/unsubscribe payloads. |
| `apps/api/src/modules/push/push.module.ts` | Exports `PushService`. |
| `apps/api/src/modules/reminders/reminders.service.ts` | **Daily reminder cron** — the existing scheduled notification. |
| `apps/api/src/modules/reminders/reminders.copy.ts` | Rotating personalized reminder message variants. |
| `apps/api/src/modules/reminders/reminders.time.ts` | Timezone → local-day resolver (no date lib). |
| `apps/api/src/modules/alerts/alerts.service.ts` | Budget-threshold alerts that also fire push (event-driven). |
| `apps/api/src/config/env.schema.ts` | VAPID env validation. |

**Web**
| File | What it does |
|---|---|
| `apps/web/src/lib/push.ts` | Browser-side subscribe/unsubscribe, fetches VAPID key from API, registers `/sw.js`. |
| `apps/web/public/sw.js` | Service worker — `push` + `notificationclick` handlers. |
| `apps/web/src/components/chat/notif-toggle.tsx` | Bell toggle button (on/off/denied/unsupported). |
| `apps/web/src/components/settings/preferences-section.tsx` | Settings UI: push toggle + daily-reminder switch. |

### Current notification triggers (two, both live)

1. **Daily reminder (cron):** `RemindersService.runHourlyReminderSweep()` is decorated `@Cron(CronExpression.EVERY_HOUR)`. Every hour it finds users for whom it's currently **~8pm local (`REMINDER_HOUR = 20`)**, who have `dailyReminders` pref on, who **haven't been nudged today** (`lastDailyReminderAt`), and who **haven't logged a transaction since their local midnight** (filtered on `createdAt`, not user-editable `transactionDate`). One push across all the user's devices, deep-linking to `/chat`.
2. **Budget alerts (event-driven):** `AlertsService.generateBudgetAlert()` fires a fire-and-forget `push.sendToUser()` when a category budget crosses 75% / 90% / 100%.

### Current notification payloads (exact strings)

**Daily reminder** — title is always `"Finby"`, body rotates deterministically by day-of-year across 4 variants (`{n}` = display name, falls back to `"there"`):
```
{n}, spent anything today? Log it in 5 seconds 💸
{n}, let's close out your day — what did you spend?
Quick check-in: anything to log before bed, {n}?
{n}, keeping today honest? Tap to log your spending.
```

**Budget alerts** (`alerts.service.ts`):
```
title: {categoryName} budget at 75%
body:  You've spent {spent} of your {limit} {categoryName} budget this period ({pct}%).

title: {categoryName} budget at 90%
body:  Heads up — {spent} of your {limit} {categoryName} budget is used ({pct}%). Easy does it.

title: {categoryName} budget exceeded
body:  You've gone over your {categoryName} budget: {spent} against a {limit} limit ({pct}%).
```

### Subscription flow

Browser (`lib/push.ts` → `enablePush`): requests `Notification.requestPermission()` → registers `/sw.js` → `GET /workspaces/:id/push/vapid-public-key` → `pushManager.subscribe({ userVisibleOnly, applicationServerKey })` → `POST .../push/subscribe` with `{endpoint, keys:{p256dh, auth}}`. Server upserts keyed on `endpoint`. No `NEXT_PUBLIC` VAPID env needed — key comes from the API.

### Production status

**Built and working, gated on env config.** `PushService` no-ops if VAPID keys are unset (logs `VAPID keys not set — push notifications are disabled.`). `.env.example` ships the keys **empty**, so whether push actually delivers in production depends on whether `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` are set in the deployed env — I can't confirm that from the repo. Code is complete, tested (specs exist for push, reminders copy/time/service), no TODO/FIXME/disabled flags.

## 2. Scheduled jobs

- `@nestjs/schedule` **is installed and active** — `ScheduleModule.forRoot()` is registered in `app.module.ts:38`.
- **One `@Cron` method exists:** `RemindersService.runHourlyReminderSweep()` (`EVERY_HOUR`).
- The billing module references cron/schedule **types** but billing reminders appear driven elsewhere; the only decorated recurring job is the reminder sweep. Budget alerts are event-driven, not scheduled.

## 3. Streak / engagement tracking

**Essentially absent.** No streak concept anywhere.
- ❌ No `streak`, `loginStreak`, `consecutiveDays`, `engagementScore` fields on `User`, `Workspace`, or any model.
- ❌ No `UserEngagement` model.
- ✅ `User.lastLoginAt` exists (`DateTime?`) and **is populated** — set on every login in `auth.service.ts:233`.
- ✅ `User.preferences` (JSON) holds `lastDailyReminderAt` (a YYYY-MM-DD string) — a per-day stamp, but only for reminder dedup, not a streak counter.
- There is no concept of "days active in a row" or any consecutive-day computation.

## 4. User activity signals available

| Signal | Where stored | Queryable? | Notes |
|---|---|---|---|
| Last login | `User.lastLoginAt` | ✅ Yes | Updated each login. Login-frequency only, not app engagement. |
| Last transaction logged (today) | `Transaction.createdAt` + `loggedByUserId` | ✅ Yes | Reminders already query `findFirst({loggedByUserId, createdAt >= localMidnight})`. This is the cleanest "active today" signal. |
| Last chat message | `ConversationMessage.createdAt` | ✅ Yes | Indexed `[conversationId, createdAt]`. Queryable per conversation; would need a join through `Conversation`→workspace/user to get per-user. No direct `userId` on the message. |
| Daily spending total | computed | ⚠️ On demand | `analytics.service.ts` has `summary()` with `transaction.aggregate({_sum: amountBase})` over a date range, `byCategory()` (groupBy), `trend()`, `topMerchants()`. **No "today's total" precomputed** — but a date-bounded aggregate over local-day is trivial with existing patterns. No materialized daily rollup. |
| Per-day reminder stamp | `User.preferences.lastDailyReminderAt` | ✅ Yes | YYYY-MM-DD string; reminder dedup only. |

## 5. Frontend notification UI

- **Permission request:** `lib/push.ts` `enablePush()`, invoked from the `NotifToggle` bell. Toggle lives in **Settings → Preferences** (`preferences-section.tsx`) and is exported from `components/chat/notif-toggle.tsx` (also usable in chat header).
- **Preferences UI:** Settings page has a "Push notifications" on/off toggle **and** a separate "Daily reminder" switch ("A nudge at ~8pm if you haven't logged anything that day. Requires notifications on."). The switch reflects **effective** state (`pushOn && prefs.dailyReminders`). **There is no time-of-day picker** — reminder hour is hardcoded `REMINDER_HOUR = 20`. iOS Safari users get an "Add to Home Screen" hint.
- **Service worker push handler** (`apps/web/public/sw.js`) — fully wired:
```js
self.addEventListener('push', (event) => {
  let payload = { title: 'Finby', body: '', url: '/chat' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (_e) {
    if (event.data) payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Finby', {
      body: payload.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: payload.url || '/chat' },
    }),
  );
});
```
`notificationclick` focuses an existing window and navigates to `payload.url` (default `/chat`), else opens a new window.

## 6. Environment variables

| Var | In `.env.example` | Notes |
|---|---|---|
| `VAPID_PUBLIC_KEY` | ✅ (empty) | Required for delivery; empty by default → push disabled. |
| `VAPID_PRIVATE_KEY` | ✅ (empty) | Required for delivery. |
| `VAPID_SUBJECT` | ✅ (`mailto:support@finby.app`) | Has a default in both `.env.example` and `env.schema.ts`. |

All three are `.optional()` in `env.schema.ts` (lines 57-60). Documented with a generation command: `node -e "console.log(require('web-push').generateVAPIDKeys())"`.

---

## Summary: What exists vs what needs to be built

### Already built (don't rebuild)
- Full Web Push delivery pipeline: VAPID config, `webpush.sendNotification`, dead-endpoint pruning, multi-device fan-out (`sendToUser` workspace-scoped + `sendToUserDevices` user-wide).
- Subscription REST API + browser subscribe/unsubscribe flow + service worker (`push` + `notificationclick`).
- `@nestjs/schedule` installed and running, with an hourly cron pattern already proven.
- **A daily contextual reminder already exists** — timezone-aware, fires at 8pm local only if the user hasn't logged today, with rotating personalized copy and per-day dedup.
- Settings UI: push toggle + daily-reminder switch with correct effective-state logic and iOS PWA hint.
- Event-driven push (budget alerts) as a second working example.
- `User.lastLoginAt` populated; `Transaction.createdAt`/`loggedByUserId` and `ConversationMessage.createdAt` queryable.

### Missing but needed for daily summary + streak
- **No streak data model** — no `streak`/`currentStreak`/`longestStreak`/`lastActiveDate` fields on `User`; no `UserEngagement` model. This is the one genuine schema gap (requires a migration).
- **No "active today" definition beyond transactions** — `lastActiveAt` covering chat-or-transaction activity doesn't exist as a single field; would be computed.
- **No precomputed daily spending rollup** — "today's total" must be aggregated fresh per request (cheap, but no cache/materialized view).
- **No streak-increment logic** and no notification copy that references streaks or a daily summary.
- **No configurable reminder time** — hour is hardcoded `20`; a daily-summary feature with a user-chosen time would need a `preferences.reminderHour` (or similar) and a tweak to the existing sweep.
- **No `userId` directly on `ConversationMessage`** — "last chat activity per user" needs a join through `Conversation`.

### Recommended approach
Build *on top of* `RemindersService` and `PushService`, not around them. The hourly sweep + local-day + dedup machinery is exactly the skeleton a daily summary needs — extend `maybeRemind` (or add a sibling method on the same sweep) to compose a summary body from a fresh `transaction.aggregate` over `[startOfDayMs, now]` instead of the current "did they log anything" boolean, reusing `reminders.copy.ts` for tone. For streaks, add a small set of fields to `User` (`currentStreak Int @default(0)`, `longestStreak Int @default(0)`, `lastStreakDate String?` as a local-YYYY-MM-DD to match the existing `lastDailyReminderAt` convention) and increment them at the natural activity chokepoint — transaction creation — comparing the new local day against `lastStreakDate` (consecutive → +1, gap → reset). Keep streak state on `User` (user-level, like reminders) rather than `Workspace`. **Gotchas:** (1) everything is local-timezone via `localDayInfo` — any streak/summary "day" boundary must go through that same util, never raw UTC, or multi-timezone users break; (2) push silently no-ops without VAPID keys, so verify they're set in the deployed env before assuming notifications ship; (3) the existing `stamp()` re-parses preferences and can theoretically clobber concurrent profile writes — if you add streak fields to `preferences` JSON you inherit that race, which is why promoting streak fields to first-class `User` columns (updated via targeted `update`) is the safer choice.

**This was read-only — nothing was modified, no migrations run.**
