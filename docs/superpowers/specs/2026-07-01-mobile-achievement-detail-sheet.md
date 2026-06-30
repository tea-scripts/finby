# Mobile — Achievement Detail Sheet (enhancement)

Date: 2026-07-01
Status: Approved (design)
App: `apps/mobile` — extends the slice-2a Streaks screen achievements grid.

## Goal

Tapping an achievement in the Streaks screen grid opens a small bottom sheet
showing the badge and what it means — for a locked badge, how to unlock it; for
an unlocked badge, when it was earned. No new data or dependencies: the
achievement `description` field already IS the requirement text (e.g. "Maintain
a 7-day streak", "Log 50 transactions", "Hit your first budget goal").

## Behavior

- Each achievements-grid cell becomes a `Pressable`; tapping it opens an
  `AchievementSheet` (built on the existing `BottomSheet` primitive) for that
  achievement. Tapping the scrim / closing dismisses it.
- The sheet shows, centered:
  - the badge **SVG**, large (~96px), via `BadgeImage`;
  - the **label** (title) and a small **tier** chip (Bronze / Silver / Gold);
  - the **description** line (the requirement);
  - a state line:
    - **Locked:** 🔒 `How to unlock: {description}`. The badge is dimmed but
      stronger than the grid (`lockedOpacity` ≈ 0.6 vs the grid's 0.4).
    - **Unlocked:** ✓ `Unlocked {relativeTime} ago` (the description shows as the
      supporting subtitle).

## Components & files

- New `src/components/streak/achievement-sheet.tsx` — `AchievementSheet({ achievement: AchievementDefView | null; unlockedAt?: string; onClose: () => void })`. Open when `achievement` is non-null. Reuses `BottomSheet`, `BadgeImage`, and `relativeTime` (`@finby/shared`).
- Modify `src/components/streak/badge-image.tsx` — add an optional `lockedOpacity?: number` prop (default `0.4`) so the sheet can show locked badges at a stronger 0.6 without changing the grid.
- Modify `src/components/streak/achievements-grid.tsx` — hold `selected` state; each cell is a `Pressable` that sets it; render `<AchievementSheet achievement={selected} unlockedAt={…} onClose={() => setSelected(null)} />`.

## Out of scope

No copy invention (description is the source); no per-achievement custom art
beyond the existing SVGs; no progress-toward-unlock bar (could be a later touch).

## Testing

- RNTL `achievement-sheet.test.tsx`: locked achievement renders "How to unlock: {description}"; unlocked renders the "Unlocked …" line; closed (`achievement={null}`) renders nothing.
- RNTL `achievements-grid.test.tsx` (extend): tapping a cell opens the sheet with that achievement's label/description.
- RNTL `badge-image.test.tsx` (extend): `lockedOpacity` overrides the default dim.
- Gate stays pristine; tsc + lint clean.
