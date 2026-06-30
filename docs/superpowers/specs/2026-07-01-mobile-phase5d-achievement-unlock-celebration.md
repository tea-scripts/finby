# Mobile Phase 5d — Slice 2b: Achievement Unlock Celebration

Date: 2026-07-01
Status: Approved (design)
App: `apps/mobile` (Expo SDK 54, RN 0.81, expo-router, NativeWind)

## 1. Goal

When a chat-logged transaction unlocks an achievement, celebrate it. The chat
SSE already delivers the unlock (`TransactionCreatedAction.newAchievements`), but
mobile currently ignores it. Slice 2b surfaces a confetti celebration modal with
the badge, a haptic, and a Share.

## 2. Behavior

- **Trigger:** in `chat-screen`, while streaming, collect `newAchievements` from any `TRANSACTION_CREATED` action of the turn. **After the stream completes** (not mid-stream), if any were collected, open the celebration. Achievements only unlock via chat transactions today, so the chat screen is the only trigger site.
- **The modal** (`AchievementUnlockedModal`): a centered, dimmed RN `Modal` (not a bottom sheet — confetti rains over a centered card) showing, on appear:
  - **Confetti** — `react-native-confetti-cannon` bursts once (pure-JS, runs in Expo Go).
  - **Success haptic** — `expo-haptics` `notificationAsync(Success)` via a thin `src/lib/haptics.ts` wrapper.
  - The **badge** (`BadgeImage`, slug from the unlock — cached from the grid, renders instantly), the headline **"Achievement unlocked! 🎉"**, the achievement **label**, and a **tier chip** (Bronze/Silver/Gold, tier-colored, matching the slice-2a sheet).
  - **Continue** — advances to the next unlock if a single log earned several; on the last one it closes.
  - **Share** — RN's built-in `Share.share({ message: 'I just unlocked "{label}" on Finby!' })` (matches the web copy; text-only, no new dep).
- **Queue:** `chat-screen` holds `celebration: NewAchievement[]`; the modal shows `celebration[0]`; Continue shifts the array; empty → closed.

## 3. Data contracts (reused)

`TransactionCreatedAction.newAchievements?: NewAchievement[]` (from `@finby/shared`), delivered via the existing `api.chat.streamMessage` `onAction` handler. `NewAchievement = { slug: string; tier: AchievementTierName; label: string; unlockedAt: string }`. The badge SVG comes from `api.gamification.getBadgeSvg(workspaceId, slug)` via `BadgeImage` (already cached).

## 4. Components & files

- New `src/components/chat/achievement-unlocked-modal.tsx` — `AchievementUnlockedModal({ workspaceId: string; achievement: NewAchievement | null; remaining: number; onContinue: () => void })`. Open while `achievement` is non-null. Renders the centered card + confetti + tier chip + badge; fires the haptic on appear (keyed on `achievement.slug` so it replays per achievement); `Continue` calls `onContinue`; `Share` calls RN `Share`. `remaining` lets the label read e.g. "Continue" vs "Next (N more)".
- New `src/lib/haptics.ts` — `celebrateHaptic(): void` (calls `expo-haptics` `notificationAsync(NotificationFeedbackType.Success)`, swallows errors). Mockable.
- Modify `src/screens/chat-screen.tsx` — collect `newAchievements` during `send()`, set `celebration` state after the stream resolves, render `<AchievementUnlockedModal>` with the queue, shift on Continue.

A small tier-chip + tier-color map already exists in `achievement-sheet.tsx`; if reused verbatim in the modal, extract a tiny shared `src/components/streak/tier-chip.tsx` (or inline — decide in the plan, keep DRY).

## 5. Dependencies

Add via `expo install`: `react-native-confetti-cannon` (pure-JS, not a native module — Expo Go safe) and `expo-haptics` (~15.0.8, Expo-Go-bundled). Mock both in tests (`jest.mock`), like `expo-blur`. After install, re-run the SAB bundle check.

## 6. Testing

- RNTL `achievement-unlocked-modal.test.tsx`: renders the badge (mock `BadgeImage`), "Achievement unlocked! 🎉", label, tier; fires the haptic on mount (mock `../../lib/haptics`); Continue calls `onContinue`; Share calls `Share.share` with the brag text (spy RN `Share`); confetti rendered (mock `react-native-confetti-cannon`); `achievement={null}` renders nothing.
- RNTL `chat-screen.test.tsx` (extend): a `streamMessage` mock whose `onAction` delivers a `TRANSACTION_CREATED` with `newAchievements` then `onDone` → after send, the celebration modal shows the unlocked label. Mock confetti/haptics/Share so output stays pristine.
- Vitest `haptics` only if it carries logic worth testing (it's a thin wrapper — a structural test is optional).
- Gate stays pristine; tsc + lint clean.

## 7. Risks / notes

- **Mid-stream vs post-stream:** open the modal only after the stream resolves, so it never interrupts a streaming reply.
- **Confetti/haptics in tests:** any test whose import tree pulls `react-native-confetti-cannon` or the haptics wrapper must mock them (native-ish / animation), same pattern as `expo-blur`.
- **Multiple unlocks:** rare but real (a log can cross two thresholds at once); the queue handles them one at a time.
- **PWA parity:** the web folds this into its StreakSheet "milestone" state; mobile's dedicated modal is the native-appropriate equivalent (badge + "You've unlocked: {label}" + Continue + Share), plus confetti/haptic native flourishes.

## 8. Out of scope

A generated achievement share-*image* (text share only for now); sound; surfacing unlocks earned outside chat; a persistent "new achievements" store (the celebration is transient per chat turn).
