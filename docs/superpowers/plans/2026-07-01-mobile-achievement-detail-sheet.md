# Mobile — Achievement Detail Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tapping an achievement in the Streaks screen grid opens a bottom sheet showing the badge, tier, and what it means (how-to-unlock when locked; unlock date when unlocked).

**Architecture:** A new `AchievementSheet` built on the existing `BottomSheet`, opened by per-cell `Pressable`s in `AchievementsGrid`. Reuses `BadgeImage` (gaining an optional `lockedOpacity` prop) and the `description` field, which already holds the requirement text. No new data or dependencies.

**Tech Stack:** Expo SDK 54, RN 0.81, NativeWind, jest-expo/RNTL.

## Global Constraints

- **Branch:** all work on the current `feat/mobile-phase5d-streaks-screen` branch (this enhancement ships with slice 2a). Re-orient git state before each task.
- **Expo Go only**; no new deps. `react-native-svg` (already added) backs `BadgeImage`.
- **Mock native-backed modules in tests** — a test whose import tree pulls `react-native-svg` must mock it, OR mock `./badge-image` directly (preferred here). `BottomSheet` uses `react-native-safe-area-context` `useSafeAreaInsets` → mock it.
- **RNTL is async** — `await render(...)`, `await fireEvent.press(...)`.
- **Strict tsconfig** `noUncheckedIndexedAccess`. eslint flat config has no react-hooks plugin.
- **`relativeTime(iso)` already returns "N … ago"** — do NOT append another "ago".
- **Theme tokens** (`src/theme/tokens.ts`): ink `#e8eef7`, muted `#8da3c0`, success `#1fae6a`, warn `#f5a524`, surface-2 `#11203a`. Tier colors: Bronze `#cd7f32`, Silver `#c0c0c0`, Gold `#f5a524`.
- **Commit style (HARD RULE):** no AI-attribution trailers / boilerplate. Atomic commits.
- **Gate:** `pnpm --filter finby-mobile test` (pristine) · `pnpm --filter finby-mobile exec tsc --noEmit` · `pnpm lint` (0 errors; pre-existing `sw.js` `_e` warning OK). Per-task: `npx eslint <changed files>`.

---

### Task 1: `BadgeImage` gains an optional `lockedOpacity`

So the sheet can show locked badges stronger (0.6) than the grid (0.4).

**Files:**
- Modify: `apps/mobile/src/components/streak/badge-image.tsx`
- Modify: `apps/mobile/src/components/streak/badge-image.test.tsx` (add one case)

**Interfaces:**
- Produces: `BadgeImage({ workspaceId, slug, label, locked, size?, lockedOpacity? })` — `lockedOpacity?: number` defaults to `0.4`.

- [ ] **Step 1: Write the failing test** — append inside the existing `describe('BadgeImage', …)`:

```tsx
  it('uses a custom lockedOpacity when provided', async () => {
    getBadgeSvg.mockResolvedValue('<svg/>');
    await render(<BadgeImage workspaceId="w1" slug="x" label="Badge X" locked lockedOpacity={0.6} />);
    expect(screen.getByLabelText('Badge X').props.style.opacity).toBe(0.6);
  });

  it('defaults lockedOpacity to 0.4 when locked', async () => {
    getBadgeSvg.mockResolvedValue('<svg/>');
    await render(<BadgeImage workspaceId="w1" slug="x" label="Badge Y" locked />);
    expect(screen.getByLabelText('Badge Y').props.style.opacity).toBe(0.4);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/streak/badge-image.test.tsx`
Expected: FAIL — the custom-opacity test sees `0.4` (prop not wired yet).

- [ ] **Step 3: Wire the prop** — in `badge-image.tsx`, add `lockedOpacity = 0.4` to the destructured props and its type, and use it in the style:

```tsx
export function BadgeImage({
  workspaceId,
  slug,
  label,
  locked,
  size = 64,
  lockedOpacity = 0.4,
}: {
  workspaceId: string;
  slug: string;
  label: string;
  locked: boolean;
  size?: number;
  lockedOpacity?: number;
}) {
```
and change the style line:
```tsx
      style={{ width: size, height: size, opacity: locked ? lockedOpacity : 1 }}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/components/streak/badge-image.test.tsx`
Expected: PASS (existing 3 + 2 new).

- [ ] **Step 5: Lint + commit**

```bash
cd apps/mobile && npx eslint src/components/streak/badge-image.tsx src/components/streak/badge-image.test.tsx
cd /home/unicorn/Documents/finby
git add apps/mobile/src/components/streak/badge-image.tsx apps/mobile/src/components/streak/badge-image.test.tsx
git commit -m "feat(mobile): BadgeImage optional lockedOpacity prop"
```

---

### Task 2: `AchievementSheet` component

The detail sheet shown when an achievement is tapped.

**Files:**
- Create: `apps/mobile/src/components/streak/achievement-sheet.tsx`
- Create: `apps/mobile/src/components/streak/achievement-sheet.test.tsx`

**Interfaces:**
- Consumes: `BottomSheet` (`../ui/bottom-sheet`), `BadgeImage` (`./badge-image`), `relativeTime` + type `AchievementDefView` (`@finby/shared`).
- Produces: `AchievementSheet({ workspaceId: string; achievement: AchievementDefView | null; unlockedAt?: string; onClose: () => void })`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/streak/achievement-sheet.test.tsx
import { render, screen } from '@testing-library/react-native';

jest.mock('./badge-image', () => ({
  BadgeImage: ({ label }: { label: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, `badge:${label}`),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import type { AchievementDefView } from '@finby/shared';
import { AchievementSheet } from './achievement-sheet';

const ACH: AchievementDefView = {
  id: 'streak-bronze', slug: 'streak-bronze', category: 'STREAK', tier: 'BRONZE',
  threshold: 7, label: 'Week Warrior', description: 'Maintain a 7-day streak',
};

describe('AchievementSheet', () => {
  it('shows how-to-unlock and the tier for a locked achievement', async () => {
    await render(<AchievementSheet workspaceId="w1" achievement={ACH} onClose={jest.fn()} />);
    expect(screen.getByText('How to unlock: Maintain a 7-day streak')).toBeTruthy();
    expect(screen.getByText('Bronze')).toBeTruthy();
  });

  it('shows the unlock time and description for an unlocked achievement', async () => {
    await render(
      <AchievementSheet workspaceId="w1" achievement={ACH} unlockedAt={new Date().toISOString()} onClose={jest.fn()} />,
    );
    expect(screen.getByText(/Unlocked just now/)).toBeTruthy();
    expect(screen.getByText('Maintain a 7-day streak')).toBeTruthy();
  });

  it('renders nothing when no achievement is selected', async () => {
    await render(<AchievementSheet workspaceId="w1" achievement={null} onClose={jest.fn()} />);
    expect(screen.queryByText('Bronze')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/streak/achievement-sheet.test.tsx`
Expected: FAIL — cannot find module `./achievement-sheet`.

- [ ] **Step 3: Write the implementation**

```tsx
// apps/mobile/src/components/streak/achievement-sheet.tsx
import { Text, View } from 'react-native';
import { relativeTime, type AchievementDefView } from '@finby/shared';
import { BottomSheet } from '../ui/bottom-sheet';
import { BadgeImage } from './badge-image';

const TIER_LABEL: Record<string, string> = { BRONZE: 'Bronze', SILVER: 'Silver', GOLD: 'Gold' };
const TIER_COLOR: Record<string, string> = { BRONZE: '#cd7f32', SILVER: '#c0c0c0', GOLD: '#f5a524' };

/** Detail sheet for one achievement: the badge, its tier, and what it means —
 *  how to unlock it (locked) or when it was earned (unlocked). Open while
 *  `achievement` is non-null. */
export function AchievementSheet({
  workspaceId,
  achievement,
  unlockedAt,
  onClose,
}: {
  workspaceId: string;
  achievement: AchievementDefView | null;
  unlockedAt?: string;
  onClose: () => void;
}) {
  const tierColor = achievement ? (TIER_COLOR[achievement.tier] ?? '#8da3c0') : '#8da3c0';
  return (
    <BottomSheet open={!!achievement} onClose={onClose}>
      {achievement ? (
        <View className="items-center gap-3 pb-2">
          <BadgeImage
            workspaceId={workspaceId}
            slug={achievement.slug}
            label={achievement.label}
            locked={!unlockedAt}
            lockedOpacity={0.6}
            size={96}
          />
          <View className="rounded-full border px-2.5 py-0.5" style={{ borderColor: tierColor }}>
            <Text className="text-xs font-semibold" style={{ color: tierColor }}>
              {TIER_LABEL[achievement.tier] ?? achievement.tier}
            </Text>
          </View>
          <Text className="text-lg font-semibold text-ink">{achievement.label}</Text>
          {unlockedAt ? (
            <>
              <Text className="text-center text-sm text-muted">{achievement.description}</Text>
              <Text className="text-center text-sm font-medium text-success">✓ Unlocked {relativeTime(unlockedAt)}</Text>
            </>
          ) : (
            <Text className="text-center text-sm text-muted">🔒 How to unlock: {achievement.description}</Text>
          )}
        </View>
      ) : null}
    </BottomSheet>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/components/streak/achievement-sheet.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Lint + commit**

```bash
cd apps/mobile && npx eslint src/components/streak/achievement-sheet.tsx src/components/streak/achievement-sheet.test.tsx
cd /home/unicorn/Documents/finby
git add apps/mobile/src/components/streak/achievement-sheet.tsx apps/mobile/src/components/streak/achievement-sheet.test.tsx
git commit -m "feat(mobile): achievement detail sheet (badge, tier, how-to-unlock)"
```

---

### Task 3: Make achievements-grid cells open the sheet

**Files:**
- Modify: `apps/mobile/src/components/streak/achievements-grid.tsx`
- Modify: `apps/mobile/src/components/streak/achievements-grid.test.tsx` (add the safe-area mock + a tap test)

**Interfaces:**
- Consumes: `AchievementSheet` (`./achievement-sheet`), `AchievementDefView` (`@finby/shared`).

- [ ] **Step 1: Add the failing test** — in `achievements-grid.test.tsx`, add the safe-area mock alongside the existing `./badge-image` mock (top of file):

```tsx
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
```

Then add a test inside the existing `describe`:

```tsx
  it('opens the detail sheet when an achievement is tapped', async () => {
    const achievements = {
      unlocked: [],
      locked: [def('streak-bronze', 'Week Warrior', 'STREAK', 'BRONZE')],
    } as unknown as AchievementsResult;
    await render(<AchievementsGrid workspaceId="w1" achievements={achievements} />);
    await fireEvent.press(screen.getByTestId('achievement-streak-bronze'));
    expect(screen.getByText('Bronze')).toBeTruthy();
  });
```

Also ensure the test imports `fireEvent` (extend the top import to `import { render, screen, fireEvent } from '@testing-library/react-native';`). Note the existing `def(...)` helper sets `description: ''`, so the locked line renders "🔒 How to unlock: " — the assertion targets the tier chip "Bronze", which is sheet-only and unambiguous.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/streak/achievements-grid.test.tsx`
Expected: FAIL — no element with testID `achievement-streak-bronze` (cells aren't pressable yet).

- [ ] **Step 3: Wire the grid** — rewrite `achievements-grid.tsx`:

```tsx
// apps/mobile/src/components/streak/achievements-grid.tsx
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { relativeTime, sortAchievementDefs, type AchievementDefView, type AchievementsResult } from '@finby/shared';
import { BadgeImage } from './badge-image';
import { AchievementSheet } from './achievement-sheet';

/** 3-column achievements grid in shared (category→tier) order. Unlocked badges
 *  show their relative unlock time; locked badges are dimmed by BadgeImage.
 *  Tapping a badge opens its detail sheet. */
export function AchievementsGrid({ workspaceId, achievements }: { workspaceId: string; achievements: AchievementsResult }) {
  const defs = sortAchievementDefs(achievements);
  const unlockedAt = new Map(achievements.unlocked.map((u) => [u.achievementDef.slug, u.unlockedAt]));
  const [selected, setSelected] = useState<AchievementDefView | null>(null);

  return (
    <>
      <View className="flex-row flex-wrap">
        {defs.map((def) => {
          const at = unlockedAt.get(def.slug);
          return (
            <Pressable
              key={def.slug}
              testID={`achievement-${def.slug}`}
              onPress={() => setSelected(def)}
              accessibilityRole="button"
              className="w-1/3 items-center gap-1 py-2"
            >
              <BadgeImage workspaceId={workspaceId} slug={def.slug} label={def.label} locked={!at} />
              <Text className="text-center text-xs font-medium text-ink">{def.label}</Text>
              {at ? <Text className="text-center text-xs text-muted">{relativeTime(at)}</Text> : null}
            </Pressable>
          );
        })}
      </View>
      <AchievementSheet
        workspaceId={workspaceId}
        achievement={selected}
        unlockedAt={selected ? unlockedAt.get(selected.slug) : undefined}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/components/streak/achievements-grid.test.tsx`
Expected: PASS (existing + 1 new).

- [ ] **Step 5: Lint + commit**

```bash
cd apps/mobile && npx eslint src/components/streak/achievements-grid.tsx src/components/streak/achievements-grid.test.tsx
cd /home/unicorn/Documents/finby
git add apps/mobile/src/components/streak/achievements-grid.tsx apps/mobile/src/components/streak/achievements-grid.test.tsx
git commit -m "feat(mobile): open achievement detail sheet on grid tap"
```

---

### Task 4: Full gate + device check

**Files:** none (verification only).

- [ ] **Step 1: Run the gate**

```bash
cd /home/unicorn/Documents/finby
pnpm --filter finby-mobile test
pnpm --filter finby-mobile exec tsc --noEmit
pnpm lint
```
Expected: mobile tests pass with **pristine output** (0 console/act lines); tsc clean; lint 0 errors (only the pre-existing `sw.js` `_e` warning).

- [ ] **Step 2: Device smoke (user, Expo Go)**

Run: `pnpm --filter finby-mobile start` → Streaks screen → tap a **locked** badge (sheet shows the badge dimmed-but-stronger + tier + "How to unlock: …") and an **unlocked** badge (full-color badge + "✓ Unlocked … "). Scrim/close dismisses.

- [ ] **Step 3: No commit** (verification). Fix any issue under the relevant task and re-run the gate.

---

## Out of scope

A progress-toward-unlock bar; per-achievement custom copy beyond `description`; animations beyond the `BottomSheet`'s built-in rise.
