# Mobile Phase 5d — Slice 1: Interactive Streak Sheet + Share Card

Date: 2026-06-30
Status: Approved (design)
App: `apps/mobile` (Expo SDK 54, RN 0.81, expo-router, NativeWind)

## 1. Goal

Make the streak experience interactive on mobile. Today the chat-header streak
badge (`src/components/dashboard/streak-badge.tsx`) is a read-only flame + count.
This slice makes it **tappable**, opening a native **StreakSheet** that shows the
user's current streak state, lets them **repair** a missed streak for 10 XP, shows
an XP card and a Mon–Sun activity row, and lets them **share a generated brag-card
image** of their streak.

This is the highest-daily-value surface of the streak feature. It is **slice 1**
of Phase 5d; the full Streaks screen (calendar heatmap, achievements grid, XP
history), the milestone-celebration state, and achievement badge artwork are
**slice 2** and out of scope here.

## 2. Scope

**In scope (slice 1):**
- Tappable chat-header streak badge → opens the StreakSheet.
- StreakSheet with four everyday states: `new`, `active`, `recoverable`, `missed`.
- 10-XP streak repair via `api.streaks.repairStreak`, with the header badge kept in sync.
- XP card (today / total) and a Mon–Sun this-week activity row.
- "Share your streak" → a generated hero-flame brag-card PNG via `react-native-view-shot`, shared through `expo-sharing`.

**Out of scope (slice 2 / later):**
- The full dedicated Streaks screen (overview, stats grid, ~6-month calendar heatmap, achievements grid, XP history feed).
- The **milestone** celebration state (auto-open on a new achievement; requires wiring chat SSE → a milestone store) and achievement **badge SVG** artwork (`react-native-svg`, also Expo-Go-bundled — decided in slice 2).
- Push reminders / `StreakStartPrompt` ("Enable reminders") — deferred with native push to Phase 6.
- An at-risk ring on the header badge (the at-risk state is surfaced inside the sheet on open).
- The Settings streak-summary row and the sheet's "See full history →" footer link (arrive with the screen in slice 2).

## 3. Data contracts (reused, already bound in `src/lib/api.ts`)

`api.streaks` (`createStreaksApi`):
- `getStreakStatus(workspaceId): Promise<StreakStatus>` — `GET /workspaces/{id}/streaks`
- `repairStreak(workspaceId): Promise<StreakStatus>` — `POST /workspaces/{id}/streaks/repair` (costs 10 XP)
- `getStreakCalendar(workspaceId): Promise<StreakCalendar>` — `GET /workspaces/{id}/streaks/calendar`

`api.gamification` (`createGamificationApi`):
- `getXpSummary(workspaceId): Promise<XpSummary>` — `GET /workspaces/{id}/gamification/xp`

Types (from `@finby/shared`):
```ts
interface StreakStatus {
  currentStreak: number;
  longestStreak: number;
  atRisk: boolean;
  repairEligible: boolean;
  repairUsedThisMonth: boolean;
}
interface StreakCalendar {
  from: string;           // YYYY-MM-DD
  to: string;             // YYYY-MM-DD (user's local today)
  activeDays: string[];   // YYYY-MM-DD
  repairedDays: string[]; // YYYY-MM-DD
}
interface XpSummary {
  balance: number;        // available XP to spend (gates repair)
  totalEarned: number;    // cumulative XP ever earned
  todayEarned: number;    // XP gained today
}
```
The auth-store `user` provides `displayName`, `currentStreak`, `longestStreak`.

## 4. State machine

Pure selector `streakSheetState(status, xpBalance)` returns one of:

| State | Condition | UI |
|-------|-----------|----|
| `new` | `currentStreak === 0` | "Start your streak" copy; no XP card; no Share; no repair. |
| `active` | `currentStreak > 0 && !atRisk` | Hero flame + count; tier copy (`streakCelebration`); XP card; week row; **Share**. |
| `recoverable` | `atRisk && repairEligible && xpBalance >= 10` | "You missed yesterday"; **Recover streak — 10 XP** button; XP card; week row. |
| `missed` | `atRisk && (!repairEligible || xpBalance < 10)` | "You missed yesterday"; disabled button showing the blocker (XP deficit, or "repair used this month"); XP card; week row. |

Evaluation order: `new` → (`atRisk` ? `recoverable`/`missed` : `active`). `recoverable`
requires **both** `repairEligible` and `xpBalance >= 10`; otherwise `missed`.

## 5. Components & files

**Pure logic — `*.test.ts` (Vitest):**
- `src/lib/streak-view.ts`
  - `streakSheetState(status: StreakStatus, xpBalance: number): 'new' | 'active' | 'recoverable' | 'missed'`
  - `isoWeekDays(today: string): string[]` — the 7 YYYY-MM-DD dates (Mon–Sun) of the ISO week containing `today`, via UTC calendar math (ported from web `WeekRow.isoWeekDays`).
  - `shareCardStats(user, status, xp, calendar): { name: string; streak: number; best: number; xp: number; daysLogged: number }` — `daysLogged = |union(activeDays, repairedDays)|` (count distinct dates across both arrays), `best = max(longestStreak, currentStreak)`, `xp = totalEarned`.
- `src/lib/streak-messages.ts`
  - `streakBand(streak: number): string[]` and `streakCelebration(streak: number, rand?: () => number): string` (ported from web; injectable RNG for deterministic tests).

**Components — `*.test.tsx` (RNTL):**
- `src/components/streak/week-row.tsx` — props `{ activeDays, repairedDays, today }`. Renders M T W T F S S labels + 7 circular indicators: active/repaired → amber fill + check; today (not active) → amber-ring outline; future → muted day number; past missed → outline. Merges active+repaired into one set.
- `src/components/streak/streak-share-card.tsx` — the off-screen hero-flame brag card (fixed size, e.g. 320×400). Brand wordmark + flame top, big centered flame + streak number + "day streak", name, then `best N · ⚡X XP · Y days logged`, `finby.app` footer. Dark theme, amber accent. Rendered hidden (e.g. absolutely positioned off-screen) so it can be captured.
- `src/components/streak/streak-sheet.tsx` — `BottomSheet` (existing primitive) content. Props `{ open, onClose, workspaceId }`. On open: parallel-fetch status/xp/calendar; loading spinner; inline error + Retry. Renders the hero, state-specific copy/CTA, XP card (hidden in `new`), `WeekRow`, and the Share button (in `active`). Owns the repair and share orchestration.

**Wiring:**
- `src/components/dashboard/streak-badge.tsx` — add optional `onPress`; when provided, wrap in a `Pressable` (accessibilityRole button). No visual change otherwise.
- `src/screens/chat-screen.tsx` — local `streakOpen` state; pass `onPress` to the header `StreakBadge`; render `<StreakSheet open={streakOpen} onClose=… workspaceId=… />`.

## 6. Behaviors

**Repair:** button → `api.streaks.repairStreak(workspaceId)`; in-progress disables the button; on success merge the returned `StreakStatus` into sheet state, re-fetch `getXpSummary` (balance changed), and update the auth-store `user.currentStreak`/`longestStreak` so the header badge reflects the recovered streak. On failure, inline notice (reuse the `chatNotice`-style mapping or a local message); button re-enables.

**Share:** build `shareCardStats` → render the hidden `StreakShareCard` → `captureRef(ref, { format: 'png', quality: 1 })` → `Sharing.isAvailableAsync()` guard → `Sharing.shareAsync(uri)`. Share is only offered in `active` (there is something to brag about).

## 7. Loading / error / empty

- Sheet body shows a centered spinner (reuse `TypingIndicator` or a simple `ActivityIndicator`) while the three fetches are in flight.
- Any fetch failure → inline message + a Retry that re-runs the fetch.
- Repair / share failures → inline, non-fatal; the sheet stays open.

## 8. Dependencies

Add via `expo install` (pins to the SDK-54 versions bundled in Expo Go, so they run without a dev build):
- `react-native-view-shot` (4.0.3)
- `expo-sharing` (~14.0.8)

Tests mock both (`jest.mock('react-native-view-shot', …)`, `jest.mock('expo-sharing', …)`), mirroring the existing `expo-blur`/`lottie-react-native` mocks. After install, run the SAB bundle check: `expo export:embed --platform ios --dev false --bundle-output /tmp/b.js` then grep `SharedArrayBuffer.prototype` (0 = OK).

## 9. Testing

- Vitest: `streakSheetState` (all four branches + boundaries: balance exactly 10, repairEligible false, repairUsedThisMonth), `isoWeekDays` (week boundaries, Sunday/Monday edges), `shareCardStats` (dedupe, best/xp selection), `streakBand`/`streakCelebration` (bands + deterministic RNG).
- RNTL: `week-row` (active/today/future/missed rendering), `streak-share-card` (renders name + streak + stats), `streak-sheet` (each state renders the right CTA; repair calls the API and syncs; share triggers capture+share; loading and error+retry). Mock `api`, `react-native-view-shot`, `expo-sharing`.
- Gate must stay pristine (0 console/act lines), `tsc` clean, `pnpm lint` 0 errors.

## 10. Risks / notes

- **Capture timing:** the hidden card must be mounted before `captureRef`. Keep it always-mounted off-screen while the sheet is open, or mount-then-capture in a microtask.
- **view-shot in tests:** any test whose module tree imports the sheet must mock `react-native-view-shot` (it touches a native view manager), same pattern as `expo-blur`.
- **Auth-store sync after repair:** confirm the auth-store exposes a setter for the user's streak fields (or add a small action) so the header badge updates without a full reload.
- **PWA parity bar:** match the web sheet's tier copy and week-row semantics; the brag card is a net-new mobile-only surface (no web equivalent).
