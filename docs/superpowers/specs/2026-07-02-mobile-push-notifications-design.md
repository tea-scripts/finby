# Mobile Push Notifications + Daily Reminder — Design

**Date:** 2026-07-02
**Status:** Approved design → ready for implementation plan
**Scope:** Give the Expo/React Native app native push notifications by adding an Expo
delivery path to the existing backend `PushService`, registering the device's Expo push
token, and adding the push + daily-reminder controls to the mobile Preferences screen.

## Goal

The backend already funnels every push type — daily reminder, budget alerts, re-engagement
nudges, AI insights — through one `PushService` (`sendToUser` / `sendToUserDevices`) with a
`{ title, body, url }` payload, delivered today only via Web Push (VAPID). The mobile app has
**no** notification code. This project adds a **second transport (Expo Push Service)** so all
existing pushes reach the phone, plus the mobile client that registers the device and the
Preferences UI to control it.

## Locked decisions

- **Transport:** Expo Push Service (`expo-notifications` on device → Expo push token; backend
  sends via `expo-server-sdk`, which brokers FCM/APNs). One delivery path for both platforms.
- **Scope:** full parity — routing delivery to Expo tokens lights up *all* existing push types;
  no per-type filtering.
- **Tap behavior:** deep-link — map the payload `url` to the matching expo-router route, fall
  back to opening the app.
- **Backend model:** a **new `MobilePushDevice` table** (not nullable columns on the web-only
  `PushSubscription`).
- **EAS credentials** (Android FCM service account, iOS APNs key) are handled **out-of-band** by
  the user; the code targets a properly-configured dev/EAS build.

## Non-goals (v1)

- Notification categories / action buttons, badge counts, rich media.
- Async delivery-receipt reconciliation (v1 prunes on the immediate `DeviceNotRegistered`
  ticket error; full receipt polling deferred).
- Any change to *when* pushes fire — the timezone-aware ~8pm reminder job, budget-alert
  thresholds, re-engagement cadence, and the `dailyReminders` preference are unchanged.

## Architecture

Three units:

1. **Backend delivery routing** — new Expo transport + device registration inside the existing
   push module.
2. **Mobile notifications client** — adapter → store → enable/disable logic → Preferences UI.
3. **Mobile deep-link handling** — tap → route.

### Data flow

```
Enable (mobile Preferences toggle)
  → request OS permission → getExpoPushTokenAsync({ projectId })
  → POST /workspaces/:id/push/expo/register { token, platform }
  → MobilePushDevice upserted (unique by token)

Any push (reminder / budget / insight / re-engagement)
  → PushService.sendToUser(workspaceId, userId, payload)  [unchanged callers]
     → deliver(): load web-push subs + Expo devices for the user
        → web-push via `web-push`  (unchanged)
        → Expo via `expo-server-sdk` (chunked); prune tokens returning DeviceNotRegistered
     → dedupe by token so sendToUserDevices (all workspaces) never double-sends one device

Tap notification (mobile)
  → response listener reads payload.url → notification-routing map → router.push(route)
     (cold start via getLastNotificationResponseAsync; warm via addNotificationResponseReceivedListener)
```

## Backend changes (`apps/api`)

- **Prisma:** new model `MobilePushDevice { id, workspaceId (FK cascade), userId, expoPushToken
  @unique, platform ('ios'|'android'), createdAt, updatedAt }`, indexed on `[workspaceId, userId]`.
  Add migration.
- **`PushService`** (`modules/push/push.service.ts`):
  - `registerExpoDevice(workspaceId, userId, token, platform)` — upsert by `expoPushToken`.
  - `unregisterExpoDevice(token)` — delete by token.
  - Extend `deliver()` (and the `sendToUser` / `sendToUserDevices` queries) to also load the
    user's `MobilePushDevice` rows and send via `expo-server-sdk` (`Expo.chunkPushNotifications`,
    `sendPushNotificationsAsync`). Map `{title, body, url}` → Expo message
    `{ to, title, body, data: { url }, sound: 'default' }`.
  - On a ticket with `details.error === 'DeviceNotRegistered'` (or invalid-token validation),
    delete that `MobilePushDevice` row (mirrors the web-push 404/410 pruning).
  - **Dedupe by token** across workspaces in `sendToUserDevices` so a device present under
    multiple workspaces is notified once.
- **Controller** (`modules/push/push.controller.ts`): `POST /workspaces/:workspaceId/push/expo/register`
  `{ token, platform }` and `POST …/push/expo/unregister` `{ token }`, with Zod schemas.
- **Env:** optional `EXPO_ACCESS_TOKEN` (recommended; `expo-server-sdk` works without it) added to
  `env.schema` + `.env.example` + `render.yaml`. Instantiate the Expo client with the token when set.
- **`@finby/core`:** add a push API (`registerExpoDevice`, `unregisterExpoDevice`) so both the
  mobile app and any future client share the transport contract.

## Mobile changes (`apps/mobile`) — following the existing adapter pattern

- **Adapter** `src/adapters/notifications.ts`: injectable `NotificationsLike` interface + factory
  `createNotifications(deps)` exposing `getPermissionStatus()`, `requestPermission()`,
  `getExpoPushToken(projectId)`, `setForegroundHandler()`, `addResponseListener(cb)`,
  `getLastResponse()`. Native binding `src/adapters/notifications.native.ts` wraps
  `expo-notifications` + `expo-device`. Wire an exported instance in `runtime.native.ts`
  (mirrors `biometric`).
- **Push store** `src/lib/push-store.ts` (Zustand vanilla): `state: 'unsupported' | 'denied' |
  'off' | 'on'`, `busy`, setters — mirrors the web store so multiple toggles stay in sync.
- **Logic** `src/lib/push.ts`:
  - `getPushState()` — reconcile OS permission + whether a token is currently registered.
  - `enablePush(workspaceId)` — request permission (→ `'denied'` if refused) → get Expo token →
    `api.push.registerExpoDevice(workspaceId, token, platform)` → `'on'`.
  - `disablePush(workspaceId)` — `api.push.unregisterExpoDevice(token)` → `'off'`.
  - Re-register on app start when permission is granted and the token changed (rotation).
- **Preferences UI** (`src/screens/settings/preferences-screen.tsx`): add a **Notifications**
  `Field`/group with:
  - **Push master `Toggle`** — calls `enablePush`/`disablePush`; reflects `pushStore.state`.
  - **Daily reminder `Toggle`** — disabled unless push is on; checked = `pushOn &&
    prefs.dailyReminders`; writes `updateProfile({ dailyReminders })`. Same semantics as web.
  - A short hint when permission is `denied` (point the user to OS settings).
- **`api.push`** added to the mobile API object (via the new `@finby/core` push API).
- **Deep-link:** `src/lib/notification-routing.ts` maps payload `url` → expo-router route
  (`/budgets`, `/chat`, `/streaks`, `/transactions`, `/dashboard`, `/settings/...`), fallback =
  open app. A response listener registered at the app root (`app/_layout.tsx` or the authed
  layout) handles warm taps and cold-start (`getLastResponse`). The foreground handler shows the
  banner while the app is open.
- **`app.json`:** add the `expo-notifications` plugin (notification icon + color); ensure the EAS
  `projectId` is available to `getExpoPushTokenAsync({ projectId })`. Add `expo-notifications` +
  `expo-device` deps.

## Error handling

- **Permission denied** → store state `'denied'`; UI shows the hint; no token requested.
- **No token / unsupported device** (e.g. simulator without push, `Expo.isExpoPushToken` false)
  → `'unsupported'`; toggle disabled with a note.
- **Backend register/unregister failure** → surface a local error, keep the toggle in its prior
  state (don't optimistically flip).
- **Stale tokens** → pruned server-side on `DeviceNotRegistered`; client re-registers on next
  enable / app-start if permission is still granted.

## Testing

- **Backend:** `PushService` — Expo register/unregister upsert+delete; `deliver()` fans out to
  both transports; prune on `DeviceNotRegistered`; dedupe-by-token in `sendToUserDevices`. Mock
  `expo-server-sdk`. Follow existing `push.service.spec.ts` patterns.
- **Mobile:** adapter with a fake `NotificationsLike`; push store; `enablePush`/`disablePush`/
  `getPushState` across permission-granted / denied / token-rotation; Preferences toggle behavior
  (daily reminder disabled until push on; effective = `pushOn && dailyReminders`); `url→route`
  mapper. Follow existing jest/vitest patterns.

## Risks / dependencies

- **EAS build + credentials (user-owned, out of band):** remote push requires a dev/EAS build
  with FCM (Android service-account JSON) and APNs (iOS key) configured in the Expo project. The
  code cannot be verified end-to-end in Expo Go. Definition of done for this plan = code complete,
  unit-tested, and the register→deliver path exercised against mocks; live device verification is
  a follow-up once the build/credentials exist.
- **`projectId` availability:** `getExpoPushTokenAsync` needs the EAS project id; confirm it's in
  `app.json`/`app.config` `extra.eas.projectId`.
