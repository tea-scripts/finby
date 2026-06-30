# Mobile Phase 5d — Slice 2a: Streaks Screen

Date: 2026-06-30
Status: Approved (design)
App: `apps/mobile` (Expo SDK 54, RN 0.81, expo-router, NativeWind)

## 1. Goal

A dedicated **Streaks screen** giving the streak experience a home beyond the
slice-1 sheet: a streak overview, a stats grid, an achievements grid with real
badge artwork, and an XP history feed. Reached from the slice-1 `StreakSheet`
("See full history →") and from a new Settings summary row. No calendar heatmap
(cut as overkill). The milestone celebration is slice 2b.

## 2. Scope

**In scope (slice 2a):**
- New pushed route `app/(app)/streaks.tsx` (hidden tab), with a back affordance.
- Sections: streak overview hero · stats grid (2×2) · achievements grid (real SVG badges, locked + unlocked) · XP history feed.
- Entry points: a "See full history →" footer link added to the slice-1 `StreakSheet`; a streak-summary row added to the Settings screen.
- Real badge artwork via `react-native-svg` (Expo-Go-bundled) fetching the server SVG per slug.
- DRY hoist of the achievement sort order and the XP-event label map into `@finby/shared`.

**Out of scope / follow-ups:**
- **Calendar heatmap** — cut (overkill for now). `buildCalendarCells` stays web-only.
- **Milestone celebration (slice 2b):** the chat-triggered unlock celebration. Feasible without new plumbing — the mobile chat SSE already receives unlocked achievements via `TransactionCreatedAction.newAchievements` (`onAction`). Will reuse the `BadgeImage` built here.
- **Achievement-unlock email (separate backend slice):** send a branded email when a user unlocks an achievement. Reuses the existing `apps/api/src/modules/email` `EmailService` + Resend provider + templates; hook the server-side achievement-award path (gamification/transactions). Must fire once per genuinely-new unlock (dedupe) and respect any notification/unsubscribe preferences.
- **Featured-achievement profile banner (separate UI slice):** show the most-recent/featured achievement as a banner on the profile surface (mobile Settings; optionally web).
- Push reminders / `StreakStartPrompt` (Phase 6); an at-risk ring on the header badge.

## 3. Navigation

- `app/(app)/streaks.tsx` is a thin route re-exporting `StreaksScreen` from `src/screens/streaks-screen.tsx`.
- Registered in `app/(app)/_layout.tsx` as `<Tabs.Screen name="streaks" options={{ href: null }} />` so it is navigable but never appears in the bar. The custom `FloatingTabBar` already renders only `TABS` entries, so no bar change is needed beyond the `href: null` registration.
- Navigated via `router.push('/streaks')` from: (a) a new "See full history →" link in `StreakSheet` (also calls `onClose`), and (b) a new Settings streak-summary row.
- The screen renders its own header with a back button (`router.back()`), matching the other in-group screens. The `FloatingTabBar` still floats over it (consistent).

## 4. Sections (one vertical ScrollView, boxless like the dashboard)

1. **Overview hero:** flame + current streak (large), "best {longestStreak}" beside/under it.
2. **Stats grid (2×2 mono tiles, dashboard style):** Longest streak · Total days logged · Total XP earned · Available XP.
3. **Achievements grid (3-col):** unlocked + locked achievements merged, deduped by slug, sorted by category then tier. Each cell: a `BadgeImage` (real SVG), the label, and either the unlock date (unlocked) or the threshold/lock affordance (locked, grayscale).
4. **XP history feed:** the events returned by `getXpHistory` (the API returns a bounded recent list), newest first — each row: event label, relative time, and a signed delta colored green (+) / red (−). An empty state when there are none.

## 5. Data

Reuses APIs already bound in `apps/mobile/src/lib/api.ts` (`api.streaks`, `api.gamification`). On mount, fetch in parallel with dashboard-style **per-section state** (each section: loading spinner → content, or inline error + Retry that re-runs just that fetch):

| Section | Source |
|---|---|
| Overview + stats (streak/best) | `getStreakStatus(workspaceId)` |
| Stats (XP earned / available) | `getXpSummary(workspaceId)` |
| Stats (total days logged) | `getStreakCalendar(workspaceId)` → count of distinct `activeDays ∪ repairedDays` (reuse slice-1 logic; no heatmap render) |
| Achievements | `getAchievements(workspaceId)` → `{ unlocked, locked }` |
| XP history | `getXpHistory(workspaceId)` → `XpTransactionView[]` |
| Per-badge art | `getBadgeSvg(workspaceId, slug)` → SVG string |

Types (from `@finby/shared`): `StreakStatus`, `XpSummary`, `StreakCalendar`, `AchievementsResult` (`UnlockedAchievement[]` + `LockedAchievement[]` where `LockedAchievement = AchievementDefView`), `XpTransactionView` (`{ id, event: XpEvent, delta, meta, createdAt }`), `AchievementDefView` (`{ id, slug, category, tier, threshold, label, description }`).

## 6. Components & files

- `src/screens/streaks-screen.tsx` — composes the sections, owns the per-section fetch state, header + back.
- `src/components/streak/streak-overview.tsx` — hero.
- `src/components/streak/streak-stats-grid.tsx` — 2×2 mono tiles.
- `src/components/streak/achievements-grid.tsx` — the grid; maps sorted achievements to cells.
- `src/components/streak/badge-image.tsx` — `BadgeImage({ workspaceId, slug, label, locked })`: fetches the SVG (loading placeholder, error fallback), renders via `react-native-svg` `SvgXml`; grayscale/dim when `locked`.
- `src/components/streak/xp-history.tsx` — the feed list.
- `src/components/dashboard/streak-badge.tsx` is unchanged; `src/components/streak/streak-sheet.tsx` gains the "See full history →" footer link; `src/screens/settings-screen.tsx` gains the summary row; `app/(app)/_layout.tsx` registers the hidden route; `app/(app)/streaks.tsx` is the route file.

**DRY hoists to `@finby/shared`** (web re-exports, per the `password-strength`/`legal`/`streak-messages` precedent):
- Achievement ordering — the `(category, tier)` sort comparator/order maps the web streaks page computes inline.
- XP-event label map — the `XpEvent → human label` lookup the web XP history uses.
(Exact current web locations are resolved during plan-writing; both are pure.)

## 7. Dependencies

- `react-native-svg` (15.12.1, Expo-Go-bundled) via `expo install`. Mock in tests (`jest.mock('react-native-svg', …)`), like `expo-blur`. Re-run the SAB bundle check after install.

## 8. Testing

- Vitest: the hoisted pure helpers (achievement sort, XP-event labels), and the days-logged count helper if extracted.
- RNTL: `BadgeImage` (loading → SVG; locked treatment; error fallback — mock the SVG fetch + `react-native-svg`), each section component, the screen (mock `api`; per-section loading/error/retry; sorted achievements; XP deltas colored), the Settings row (navigates), and the sheet "See full history →" link (navigates + closes).
- Gate stays pristine (0 console/act lines), `tsc` clean, `pnpm lint` 0 errors.

## 9. Risks / notes

- **Per-badge fetches:** the achievements grid issues one `getBadgeSvg` per slug. Fine for the badge count; each `BadgeImage` owns its own loading/error so one failure doesn't sink the grid.
- **`react-native-svg` in tests:** any test whose import tree pulls a badge must mock `react-native-svg` (native view manager), same pattern as `expo-blur`.
- **PWA parity bar:** match the web streaks page's section semantics (sort order, locked/unlocked treatment, XP delta coloring). The badge SVGs are the same server assets the web renders.
- **Nav with the custom tab bar:** the hidden `href: null` route must not appear in `FloatingTabBar`; confirmed the bar filters to `TABS` entries, so registration is inert there.
