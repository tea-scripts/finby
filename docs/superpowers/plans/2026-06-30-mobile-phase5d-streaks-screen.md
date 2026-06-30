# Mobile Phase 5d Slice 2a — Streaks Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pushed mobile Streaks screen (overview + stats grid + achievements grid with real SVG badges + XP history), reachable from the slice-1 sheet and a new Settings row.

**Architecture:** Shared pure-logic (XP-event labels, achievement sort, Intl-free relative-time) is hoisted into `@finby/shared` (web re-exports). The screen is a hidden `href: null` expo-router tab route composing small RN section components, each fed by a dashboard-style `SectionState` (per-section loading/error/retry). Badges render via `react-native-svg`'s `SvgXml` fetching the server SVG per slug.

**Tech Stack:** Expo SDK 54, RN 0.81, NativeWind, expo-router, zustand. `react-native-svg` 15.12.1 (new, Expo-Go-bundled). Tests: Vitest (`*.test.ts`) + jest-expo/RNTL (`*.test.tsx`).

## Global Constraints

- **Branch:** all work on `feat/mobile-phase5d-streaks-screen` (this working tree). Re-orient git state before each task.
- **Rebuild `@finby/shared` after Tasks 1–2.** Mobile (jest/vitest) and web resolve `@finby/shared` from its built `dist`; after changing the shared package run `pnpm --filter @finby/shared build` before any consumer test/tsc. Tasks 1–2 also run the touched web file's vitest.
- **Expo Go only** — no native modules beyond `bundledNativeModules.json`. `react-native-svg` 15.12.1 is bundled; install via `expo install`.
- **Hermes-safe** — no `Intl.RelativeTimeFormat`/`Intl.NumberFormat` (Expo Go Hermes lacks them); use the plain formatters in this plan.
- **No Reanimated / no other SVG runtime** — motion via RN `Animated`; SVG only via `react-native-svg`.
- **Strict tsconfig** `noUncheckedIndexedAccess` — guard/`!` indexed access (Vitest array-index assertions need `!`).
- **eslint flat config has no react-hooks plugin** — never add a `react-hooks/exhaustive-deps` disable (errors as unknown rule). Loose `.js` files use `globalThis.console`.
- **Mock native-backed modules in tests** — any test whose import tree pulls `react-native-svg`, `expo-blur`, `react-native-view-shot`, `expo-sharing`, or `lottie-react-native` must `jest.mock` them. `@expo/vector-icons` works unmocked in screen tests; mock it in focused component tests asserting icon names.
- **RNTL is async** — `await render(...)`, `await fireEvent.*(...)`, `waitFor`.
- **typedRoutes** — adding the `streaks` route means `tsc` needs an up-to-date `apps/mobile/.expo/types/router.d.ts`. After creating the route file, regenerate it: `cd apps/mobile && EXPO_NO_TELEMETRY=1 CI=1 npx expo start --port 8099` (it writes types then exits in CI mode; if it hangs >60s, Ctrl-C — the types are written early). Then `router.push('/streaks')` typechecks.
- **Theme tokens** (`src/theme/tokens.ts`): canvas `#06101f`, surface `#0b1626`, surface-2 `#11203a`, line `#1c2c46`, accent `#1d6ef5`, ink `#e8eef7`, muted `#8da3c0`, faint `#5b6f8c`, success `#1fae6a`, warn `#f5a524`, danger `#ef4444`. Mono = `Platform.select({ ios: 'Menlo', default: 'monospace' })`.
- **Commit style (HARD RULE):** no AI-attribution trailers / "Generated with" boilerplate. Atomic commits.
- **Gate (before done):** `pnpm --filter @finby/shared test` · `pnpm --filter finby-mobile test` (pristine, 0 console/act lines) · `pnpm --filter finby-mobile exec tsc --noEmit` · `pnpm lint` (0 errors; pre-existing `apps/web/public/sw.js` `_e` warning OK). Per-task: `npx eslint <changed files>`.

---

### Task 1: Hoist gamification view-helpers into `@finby/shared`

The XP-event label map and the achievement sort/dedupe are pure and shared with web's streaks page.

**Files:**
- Create: `packages/shared/src/gamification-view.ts`, `packages/shared/src/gamification-view.test.ts`
- Modify: `packages/shared/src/index.ts` (add export)
- Modify: `apps/web/src/app/(app)/streaks/page.tsx` (consume the shared helpers; delete the inline copies)

**Interfaces:**
- Consumes: `AchievementDefView`, `AchievementsResult`, `XpEvent` from `./api-types`.
- Produces (from `@finby/shared`): `XP_EVENT_LABELS: Record<XpEvent,string>`, `xpEventLabel(event: XpEvent): string`, `sortAchievementDefs(result: AchievementsResult): AchievementDefView[]`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/gamification-view.test.ts
import { describe, expect, it } from 'vitest';
import type { AchievementsResult } from './api-types';
import { sortAchievementDefs, xpEventLabel, XP_EVENT_LABELS } from './gamification-view';

const def = (slug: string, category: string, tier: string) =>
  ({ id: slug, slug, category, tier, threshold: 1, label: slug, description: '' });

describe('xpEventLabel', () => {
  it('maps known events and falls back to the raw event', () => {
    expect(xpEventLabel('DAILY_LOGIN')).toBe('Daily check-in');
    expect(XP_EVENT_LABELS.TRANSACTION_LOGGED).toBe('Transaction logged');
    expect(xpEventLabel('SOMETHING_NEW' as never)).toBe('SOMETHING_NEW');
  });
});

describe('sortAchievementDefs', () => {
  it('dedupes by slug and sorts by category then tier', () => {
    const result = {
      unlocked: [{ id: 'u1', unlockedAt: 'x', achievementDef: def('a', 'GOALS', 'GOLD') }],
      locked: [def('b', 'STREAK', 'SILVER'), def('c', 'STREAK', 'BRONZE'), def('a', 'GOALS', 'GOLD')],
    } as unknown as AchievementsResult;
    expect(sortAchievementDefs(result).map((d) => d.slug)).toEqual(['c', 'b', 'a']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @finby/shared exec vitest run src/gamification-view.test.ts`
Expected: FAIL — cannot find module `./gamification-view`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/shared/src/gamification-view.ts
import type { AchievementDefView, AchievementsResult, XpEvent } from './api-types';

/** Human labels for XP ledger events (shared by the web + mobile XP history). */
export const XP_EVENT_LABELS: Record<XpEvent, string> = {
  STREAK_DAY: 'Streak maintained',
  STREAK_MILESTONE: 'Milestone bonus',
  TRANSACTION_LOGGED: 'Transaction logged',
  GOAL_HIT: 'Goal hit',
  STREAK_RECOVERY: 'Streak recovery (spent)',
  REFERRAL_BONUS: 'Referral bonus',
  DAILY_LOGIN: 'Daily check-in',
};

export function xpEventLabel(event: XpEvent): string {
  return XP_EVENT_LABELS[event] ?? event;
}

const CATEGORY_ORDER: Record<string, number> = { STREAK: 0, TRANSACTIONS: 1, GOALS: 2 };
const TIER_ORDER: Record<string, number> = { BRONZE: 0, SILVER: 1, GOLD: 2 };

/** Merge unlocked + locked achievement defs, dedupe by slug, and sort by
 *  category then tier — the display order for the achievements grid. */
export function sortAchievementDefs(result: AchievementsResult): AchievementDefView[] {
  const defs = [...result.unlocked.map((u) => u.achievementDef), ...result.locked];
  const seen = new Set<string>();
  const out: AchievementDefView[] = [];
  for (const d of defs) {
    if (!seen.has(d.slug)) {
      seen.add(d.slug);
      out.push(d);
    }
  }
  out.sort(
    (a, b) =>
      (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99) ||
      (TIER_ORDER[a.tier] ?? 99) - (TIER_ORDER[b.tier] ?? 99),
  );
  return out;
}
```

- [ ] **Step 4: Export from the shared index** — add to `packages/shared/src/index.ts`:

```ts
export * from './gamification-view';
```

- [ ] **Step 5: Refactor the web streaks page** to use the shared helpers. In `apps/web/src/app/(app)/streaks/page.tsx`:
  - Add to the `@finby/shared`/types import area: `import { XP_EVENT_LABELS, sortAchievementDefs } from '@finby/shared';` (the page already imports types from `@/lib/types` which re-exports `@finby/shared` — keep those).
  - DELETE the inline `const XP_EVENT_LABELS = {…}` (lines ~22–30), `const CATEGORY_ORDER = …` and `const TIER_ORDER = …` (lines ~32–33).
  - REPLACE the `allAchievements` IIFE (the `const allAchievements: AchievementDefView[] = (() => { … })()` block) with:

```tsx
  const allAchievements = achievements
    ? sortAchievementDefs(achievements)
    : [];
```
  (Leave `unlockedMap`, `totalLoggedDays`, and the JSX that consumes `XP_EVENT_LABELS[tx.event]` and `allAchievements` unchanged.)
  - Remove any type import that becomes unused after this change — `XpEvent` (only used by the deleted inline label map) and `AchievementDefView` (if the IIFE was its only reference) — so tsc/eslint stay clean.

- [ ] **Step 6: Build shared, run shared + web tests**

Run:
```bash
pnpm --filter @finby/shared build
pnpm --filter @finby/shared exec vitest run src/gamification-view.test.ts
pnpm --filter finby-web exec tsc --noEmit
```
Expected: shared builds; shared test passes; web typecheck clean (the page still compiles with the shared helpers).

- [ ] **Step 7: Lint + commit**

```bash
cd /home/unicorn/Documents/finby
npx eslint packages/shared/src/gamification-view.ts packages/shared/src/gamification-view.test.ts apps/web/src/app/\(app\)/streaks/page.tsx
git add packages/shared/src/gamification-view.ts packages/shared/src/gamification-view.test.ts packages/shared/src/index.ts "apps/web/src/app/(app)/streaks/page.tsx"
git commit -m "refactor(shared): hoist XP-event labels + achievement sort into @finby/shared"
```

---

### Task 2: Hoist an Intl-free `relativeTime` into `@finby/shared`

Web's `relativeTime` uses `Intl.RelativeTimeFormat` (absent on Expo Go Hermes). Move a Hermes-safe version to shared; web re-exports it.

**Files:**
- Create: `packages/shared/src/relative-time.ts`, `packages/shared/src/relative-time.test.ts`
- Modify: `packages/shared/src/index.ts` (add export)
- Modify: `apps/web/src/lib/relative-time.ts` (replace body with a shim)

**Interfaces:**
- Produces (from `@finby/shared`): `relativeTime(iso: string, now?: Date): string`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/relative-time.test.ts
import { describe, expect, it } from 'vitest';
import { relativeTime } from './relative-time';

const NOW = new Date('2026-06-30T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe('relativeTime', () => {
  it('formats recent and older timestamps without Intl', () => {
    expect(relativeTime(ago(10_000), NOW)).toBe('just now');
    expect(relativeTime(ago(5 * 60_000), NOW)).toBe('5 minutes ago');
    expect(relativeTime(ago(60_000), NOW)).toBe('1 minute ago');
    expect(relativeTime(ago(3 * 3_600_000), NOW)).toBe('3 hours ago');
    expect(relativeTime(ago(2 * 86_400_000), NOW)).toBe('2 days ago');
    expect(relativeTime(ago(40 * 86_400_000), NOW)).toBe('1 month ago');
  });
  it('returns empty string for an invalid date', () => {
    expect(relativeTime('not-a-date', NOW)).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @finby/shared exec vitest run src/relative-time.test.ts`
Expected: FAIL — cannot find module `./relative-time`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/shared/src/relative-time.ts
/** Compact "x ago" formatting, no date library and no Intl (Hermes-safe).
 *  `now` is injectable for deterministic tests. Always counts magnitude, so
 *  future timestamps also read "… ago" — fine for ledger/unlock times (past). */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const sec = Math.round((now.getTime() - then) / 1000);
  const abs = Math.abs(sec);
  const ago = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  if (abs < 45) return 'just now';
  const min = Math.round(abs / 60);
  if (min < 45) return ago(min, 'minute');
  const hr = Math.round(abs / 3600);
  if (hr < 24) return ago(hr, 'hour');
  const day = Math.round(abs / 86400);
  if (day < 30) return ago(day, 'day');
  const month = Math.round(abs / (86400 * 30));
  if (month < 12) return ago(month, 'month');
  return ago(Math.round(abs / (86400 * 365)), 'year');
}
```

- [ ] **Step 4: Export from the shared index** — add to `packages/shared/src/index.ts`:

```ts
export * from './relative-time';
```

- [ ] **Step 5: Replace the web file with a shim** — overwrite `apps/web/src/lib/relative-time.ts` entirely:

```ts
export { relativeTime } from '@finby/shared';
```

- [ ] **Step 6: Build shared, run shared test + web typecheck**

Run:
```bash
pnpm --filter @finby/shared build
pnpm --filter @finby/shared exec vitest run src/relative-time.test.ts
pnpm --filter finby-web exec tsc --noEmit
```
Expected: shared builds; shared test passes; web typecheck clean (the two consumers — streaks page + alerts-drawer — import the same `relativeTime` name from the shim).

- [ ] **Step 7: Lint + commit**

```bash
cd /home/unicorn/Documents/finby
npx eslint packages/shared/src/relative-time.ts packages/shared/src/relative-time.test.ts apps/web/src/lib/relative-time.ts
git add packages/shared/src/relative-time.ts packages/shared/src/relative-time.test.ts packages/shared/src/index.ts apps/web/src/lib/relative-time.ts
git commit -m "refactor(shared): hoist Intl-free relativeTime into @finby/shared"
```

---

### Task 3: Install `react-native-svg` and verify the bundle

**Files:** Modify `apps/mobile/package.json` (via `expo install`), root `pnpm-lock.yaml`.

- [ ] **Step 1: Install (SDK-pinned)**

Run: `cd apps/mobile && pnpm exec expo install react-native-svg`
Expected: adds `react-native-svg@15.12.1` (the version in Expo Go's `bundledNativeModules.json`).

- [ ] **Step 2: Verify the JS bundle is SharedArrayBuffer-clean**

Run:
```bash
cd apps/mobile && timeout 200 pnpm exec expo export:embed --platform ios --dev false --bundle-output /tmp/b.js && grep -c "SharedArrayBuffer.prototype" /tmp/b.js
```
Expected: bundle writes; grep prints `0`. If `timeout` kills it (exit 124), the install is the deliverable — note it and proceed.

- [ ] **Step 3: Commit**

```bash
cd /home/unicorn/Documents/finby
git add apps/mobile/package.json pnpm-lock.yaml
git commit -m "build(mobile): add react-native-svg (Expo Go bundled)"
```

---

### Task 4: BadgeImage component

Fetches a badge's server SVG by slug and renders it; dimmed + lock overlay when locked.

**Files:**
- Create: `apps/mobile/src/components/streak/badge-image.tsx`, `apps/mobile/src/components/streak/badge-image.test.tsx`

**Interfaces:**
- Consumes: `api.gamification.getBadgeSvg(workspaceId, slug): Promise<string>` from `../../lib/runtime.native`; `SvgXml` from `react-native-svg`; `Ionicons`.
- Produces: `BadgeImage({ workspaceId: string; slug: string; label: string; locked: boolean; size?: number })`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/streak/badge-image.test.tsx
import { render, screen, waitFor } from '@testing-library/react-native';

jest.mock('../../lib/runtime.native', () => ({
  api: { gamification: { getBadgeSvg: jest.fn() } },
}));
jest.mock('react-native-svg', () => ({
  SvgXml: ({ xml }: { xml: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, xml ? 'svg' : ''),
}));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));

import { api } from '../../lib/runtime.native';
import { BadgeImage } from './badge-image';

const getBadgeSvg = api.gamification.getBadgeSvg as jest.Mock;

beforeEach(() => getBadgeSvg.mockReset());

describe('BadgeImage', () => {
  it('fetches and renders the SVG when unlocked', async () => {
    getBadgeSvg.mockResolvedValue('<svg/>');
    await render(<BadgeImage workspaceId="w1" slug="week-warrior" label="Week Warrior" locked={false} />);
    await waitFor(() => expect(screen.getByText('svg')).toBeTruthy());
    expect(getBadgeSvg).toHaveBeenCalledWith('w1', 'week-warrior');
  });

  it('shows a lock overlay when locked', async () => {
    getBadgeSvg.mockResolvedValue('<svg/>');
    await render(<BadgeImage workspaceId="w1" slug="x" label="X" locked />);
    await waitFor(() => expect(screen.getByText('lock-closed')).toBeTruthy());
  });

  it('keeps the placeholder when the fetch fails', async () => {
    getBadgeSvg.mockRejectedValue(new Error('nope'));
    await render(<BadgeImage workspaceId="w1" slug="x" label="X" locked={false} />);
    await waitFor(() => expect(getBadgeSvg).toHaveBeenCalled());
    expect(screen.queryByText('svg')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/streak/badge-image.test.tsx`
Expected: FAIL — cannot find module `./badge-image`.

- [ ] **Step 3: Write the implementation**

```tsx
// apps/mobile/src/components/streak/badge-image.tsx
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/runtime.native';

/** An achievement badge: fetches the bearer-protected server SVG by slug and
 *  renders it with react-native-svg. Locked badges are dimmed with a lock
 *  overlay (true grayscale isn't available for SVG in Expo Go). A pulse-free
 *  placeholder stays if the fetch fails. */
export function BadgeImage({
  workspaceId,
  slug,
  label,
  locked,
  size = 64,
}: {
  workspaceId: string;
  slug: string;
  label: string;
  locked: boolean;
  size?: number;
}) {
  const [xml, setXml] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.gamification
      .getBadgeSvg(workspaceId, slug)
      .then((svg) => {
        if (active) setXml(svg);
      })
      .catch(() => {
        /* leave the placeholder on failure */
      });
    return () => {
      active = false;
    };
  }, [workspaceId, slug]);

  return (
    <View
      accessibilityLabel={label}
      style={{ width: size, height: size, opacity: locked ? 0.4 : 1 }}
      className="items-center justify-center rounded-xl bg-surface-2"
    >
      {xml ? <SvgXml xml={xml} width={size} height={size} /> : null}
      {locked ? (
        <View className="absolute inset-0 items-center justify-center">
          <Ionicons name="lock-closed" size={18} color="#8da3c0" />
        </View>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/components/streak/badge-image.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Lint + commit**

```bash
cd apps/mobile && npx eslint src/components/streak/badge-image.tsx src/components/streak/badge-image.test.tsx
cd /home/unicorn/Documents/finby
git add apps/mobile/src/components/streak/badge-image.tsx apps/mobile/src/components/streak/badge-image.test.tsx
git commit -m "feat(mobile): BadgeImage (react-native-svg, locked/unlocked)"
```

---

### Task 5: StreakOverview + StreakStatsGrid components

Two small presentational pieces: the hero and the 2×2 stat tiles.

**Files:**
- Create: `apps/mobile/src/components/streak/streak-overview.tsx`, `apps/mobile/src/components/streak/streak-overview.test.tsx`
- Create: `apps/mobile/src/components/streak/streak-stats-grid.tsx`, `apps/mobile/src/components/streak/streak-stats-grid.test.tsx`

**Interfaces:**
- Produces: `StreakOverview({ currentStreak: number; longestStreak: number })`; `StreakStatsGrid({ longestStreak: number; daysLogged: number; totalXp: number; availableXp: number })`

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/mobile/src/components/streak/streak-overview.test.tsx
import { render, screen } from '@testing-library/react-native';
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));
import { StreakOverview } from './streak-overview';

describe('StreakOverview', () => {
  it('shows the current streak and best', async () => {
    await render(<StreakOverview currentStreak={7} longestStreak={30} />);
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText(/Best/)).toBeTruthy();
    expect(screen.getByText(/30/)).toBeTruthy();
  });
});
```

```tsx
// apps/mobile/src/components/streak/streak-stats-grid.test.tsx
import { render, screen } from '@testing-library/react-native';
import { StreakStatsGrid } from './streak-stats-grid';

describe('StreakStatsGrid', () => {
  it('renders the four stat tiles', async () => {
    await render(<StreakStatsGrid longestStreak={30} daysLogged={48} totalXp={1250} availableXp={40} />);
    expect(screen.getByText('Longest streak')).toBeTruthy();
    expect(screen.getByText('Total days logged')).toBeTruthy();
    expect(screen.getByText('48')).toBeTruthy();
    expect(screen.getByText('1,250 XP')).toBeTruthy();
    expect(screen.getByText('40 XP')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/mobile && pnpm exec jest src/components/streak/streak-overview.test.tsx src/components/streak/streak-stats-grid.test.tsx`
Expected: FAIL — cannot find the modules.

- [ ] **Step 3: Write the implementations**

```tsx
// apps/mobile/src/components/streak/streak-overview.tsx
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/** The streak hero: flame + current streak, with the best streak alongside. */
export function StreakOverview({ currentStreak, longestStreak }: { currentStreak: number; longestStreak: number }) {
  return (
    <View className="flex-row items-center justify-between">
      <View className="flex-row items-center gap-3">
        <Ionicons name="flame" size={40} color="#f5a524" />
        <View>
          <Text className="text-3xl font-bold text-ink">{currentStreak}</Text>
          <Text className="text-sm text-muted">{currentStreak === 1 ? 'day' : 'days'} streak</Text>
        </View>
      </View>
      <View className="items-end">
        <Text className="text-sm text-muted">Best</Text>
        <Text className="text-lg font-semibold text-ink">
          {longestStreak} {longestStreak === 1 ? 'day' : 'days'}
        </Text>
      </View>
    </View>
  );
}
```

```tsx
// apps/mobile/src/components/streak/streak-stats-grid.tsx
import { Platform, Text, View } from 'react-native';
import { formatXp } from '../../lib/streak-view';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-xl border border-line bg-surface p-3.5">
      <Text className="text-xs text-muted">{label}</Text>
      <Text className="mt-1 text-lg font-semibold text-ink" style={{ fontFamily: MONO }}>
        {value}
      </Text>
    </View>
  );
}

/** 2×2 grid of streak/XP stat tiles (mono values), dashboard style. */
export function StreakStatsGrid({
  longestStreak,
  daysLogged,
  totalXp,
  availableXp,
}: {
  longestStreak: number;
  daysLogged: number;
  totalXp: number;
  availableXp: number;
}) {
  return (
    <View className="gap-3">
      <View className="flex-row gap-3">
        <Tile label="Longest streak" value={String(longestStreak)} />
        <Tile label="Total days logged" value={String(daysLogged)} />
      </View>
      <View className="flex-row gap-3">
        <Tile label="Total XP earned" value={`${formatXp(totalXp)} XP`} />
        <Tile label="Available XP" value={`${formatXp(availableXp)} XP`} />
      </View>
    </View>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest src/components/streak/streak-overview.test.tsx src/components/streak/streak-stats-grid.test.tsx`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
cd apps/mobile && npx eslint src/components/streak/streak-overview.tsx src/components/streak/streak-overview.test.tsx src/components/streak/streak-stats-grid.tsx src/components/streak/streak-stats-grid.test.tsx
cd /home/unicorn/Documents/finby
git add apps/mobile/src/components/streak/streak-overview.tsx apps/mobile/src/components/streak/streak-overview.test.tsx apps/mobile/src/components/streak/streak-stats-grid.tsx apps/mobile/src/components/streak/streak-stats-grid.test.tsx
git commit -m "feat(mobile): streak overview hero + 2x2 stats grid"
```

---

### Task 6: AchievementsGrid component

A 3-column grid of badges in shared sort order; unlocked show their date, locked are dimmed.

**Files:**
- Create: `apps/mobile/src/components/streak/achievements-grid.tsx`, `apps/mobile/src/components/streak/achievements-grid.test.tsx`

**Interfaces:**
- Consumes: `sortAchievementDefs`, `relativeTime`, `AchievementsResult` from `@finby/shared`; `BadgeImage` from `./badge-image`.
- Produces: `AchievementsGrid({ workspaceId: string; achievements: AchievementsResult })`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/streak/achievements-grid.test.tsx
import { render, screen } from '@testing-library/react-native';

jest.mock('./badge-image', () => ({
  BadgeImage: ({ label, locked }: { label: string; locked: boolean }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, `${label}:${locked ? 'locked' : 'unlocked'}`),
}));

import type { AchievementsResult } from '@finby/shared';
import { AchievementsGrid } from './achievements-grid';

const def = (slug: string, label: string, category = 'STREAK', tier = 'BRONZE') =>
  ({ id: slug, slug, category, tier, threshold: 1, label, description: '' });

describe('AchievementsGrid', () => {
  it('renders unlocked and locked badges with the unlock date for unlocked', async () => {
    const achievements = {
      unlocked: [{ id: 'u', unlockedAt: new Date().toISOString(), achievementDef: def('week', 'Week Warrior') }],
      locked: [def('month', 'Month Master', 'STREAK', 'SILVER')],
    } as unknown as AchievementsResult;
    await render(<AchievementsGrid workspaceId="w1" achievements={achievements} />);
    expect(screen.getByText('Week Warrior:unlocked')).toBeTruthy();
    expect(screen.getByText('Month Master:locked')).toBeTruthy();
    expect(screen.getByText('just now')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/streak/achievements-grid.test.tsx`
Expected: FAIL — cannot find module `./achievements-grid`.

- [ ] **Step 3: Write the implementation**

```tsx
// apps/mobile/src/components/streak/achievements-grid.tsx
import { Text, View } from 'react-native';
import { relativeTime, sortAchievementDefs, type AchievementsResult } from '@finby/shared';
import { BadgeImage } from './badge-image';

/** 3-column achievements grid in shared (category→tier) order. Unlocked badges
 *  show their relative unlock time; locked badges are dimmed by BadgeImage. */
export function AchievementsGrid({ workspaceId, achievements }: { workspaceId: string; achievements: AchievementsResult }) {
  const defs = sortAchievementDefs(achievements);
  const unlockedAt = new Map(achievements.unlocked.map((u) => [u.achievementDef.slug, u.unlockedAt]));

  return (
    <View className="flex-row flex-wrap">
      {defs.map((def) => {
        const at = unlockedAt.get(def.slug);
        return (
          <View key={def.slug} className="w-1/3 items-center gap-1 py-2">
            <BadgeImage workspaceId={workspaceId} slug={def.slug} label={def.label} locked={!at} />
            <Text className="text-center text-xs font-medium text-ink">{def.label}</Text>
            {at ? <Text className="text-center text-xs text-muted">{relativeTime(at)}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/components/streak/achievements-grid.test.tsx`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
cd apps/mobile && npx eslint src/components/streak/achievements-grid.tsx src/components/streak/achievements-grid.test.tsx
cd /home/unicorn/Documents/finby
git add apps/mobile/src/components/streak/achievements-grid.tsx apps/mobile/src/components/streak/achievements-grid.test.tsx
git commit -m "feat(mobile): achievements grid (sorted, locked/unlocked badges)"
```

---

### Task 7: XpHistory component

The XP ledger feed: event label, relative time, signed colored delta; empty state.

**Files:**
- Create: `apps/mobile/src/components/streak/xp-history.tsx`, `apps/mobile/src/components/streak/xp-history.test.tsx`

**Interfaces:**
- Consumes: `xpEventLabel`, `relativeTime`, `XpTransactionView` from `@finby/shared`.
- Produces: `XpHistory({ history: XpTransactionView[] })`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/streak/xp-history.test.tsx
import { render, screen } from '@testing-library/react-native';
import type { XpTransactionView } from '@finby/shared';
import { XpHistory } from './xp-history';

const tx = (over: Partial<XpTransactionView>): XpTransactionView =>
  ({ id: 'x', event: 'TRANSACTION_LOGGED', delta: 5, meta: null, createdAt: new Date().toISOString(), ...over });

describe('XpHistory', () => {
  it('renders rows with labels and signed deltas', async () => {
    await render(<XpHistory history={[tx({ id: '1', delta: 5 }), tx({ id: '2', event: 'STREAK_RECOVERY', delta: -10 })]} />);
    expect(screen.getByText('Transaction logged')).toBeTruthy();
    expect(screen.getByText('+5 XP')).toBeTruthy();
    expect(screen.getByText('-10 XP')).toBeTruthy();
  });

  it('shows an empty state when there is no history', async () => {
    await render(<XpHistory history={[]} />);
    expect(screen.getByText(/No XP earned yet/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/streak/xp-history.test.tsx`
Expected: FAIL — cannot find module `./xp-history`.

- [ ] **Step 3: Write the implementation**

```tsx
// apps/mobile/src/components/streak/xp-history.tsx
import { Text, View } from 'react-native';
import { relativeTime, xpEventLabel, type XpTransactionView } from '@finby/shared';

/** The XP ledger feed (newest first as the API returns it): event label +
 *  relative time on the left, a green/red signed delta on the right. */
export function XpHistory({ history }: { history: XpTransactionView[] }) {
  if (history.length === 0) {
    return <Text className="text-sm text-muted">No XP earned yet — log a transaction to get started.</Text>;
  }
  return (
    <View>
      {history.map((tx, i) => (
        <View
          key={tx.id}
          className={`flex-row items-center justify-between py-3 ${i > 0 ? 'border-t border-line' : ''}`}
        >
          <View>
            <Text className="text-sm text-ink">{xpEventLabel(tx.event)}</Text>
            <Text className="text-xs text-muted">{relativeTime(tx.createdAt)}</Text>
          </View>
          <Text className={`text-sm font-medium ${tx.delta > 0 ? 'text-success' : 'text-danger'}`}>
            {tx.delta > 0 ? '+' : ''}
            {tx.delta} XP
          </Text>
        </View>
      ))}
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/components/streak/xp-history.test.tsx`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
cd apps/mobile && npx eslint src/components/streak/xp-history.tsx src/components/streak/xp-history.test.tsx
cd /home/unicorn/Documents/finby
git add apps/mobile/src/components/streak/xp-history.tsx apps/mobile/src/components/streak/xp-history.test.tsx
git commit -m "feat(mobile): XP history feed"
```

---

### Task 8: StreaksScreen + route registration

Compose the sections with per-group fetch state, a header + back, and register the hidden route.

**Files:**
- Create: `apps/mobile/src/screens/streaks-screen.tsx`, `apps/mobile/src/screens/streaks-screen.test.tsx`
- Create: `apps/mobile/app/(app)/streaks.tsx` (route)
- Modify: `apps/mobile/app/(app)/_layout.tsx` (register hidden `streaks` screen)

**Interfaces:**
- Consumes: `SectionCard`/`SectionLoading`/`SectionError`/`SectionState` (`../components/dashboard/section-card`); `StreakOverview`, `StreakStatsGrid`, `AchievementsGrid`, `XpHistory` (`../components/streak/*`); `useTabBarSpace` (`../components/nav/floating-tab-bar`); `useAuthStore`; `api`; `useRouter` (expo-router). Types `StreakStatus`/`XpSummary`/`StreakCalendar`/`AchievementsResult`/`XpTransactionView` from `@finby/shared`.
- Produces: `StreaksScreen()` (default export from the route file).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/screens/streaks-screen.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const authState = { workspace: { id: 'w1' } };
jest.mock('../lib/use-auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector(authState),
}));
jest.mock('../lib/runtime.native', () => ({
  api: {
    streaks: { getStreakStatus: jest.fn(), getStreakCalendar: jest.fn() },
    gamification: { getXpSummary: jest.fn(), getAchievements: jest.fn(), getXpHistory: jest.fn(), getBadgeSvg: jest.fn(async () => '<svg/>') },
  },
}));
const back = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back, push: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-blur', () => ({ BlurView: ({ children }: { children: unknown }) => children }));
jest.mock('react-native-svg', () => ({ SvgXml: () => null }));

import { api } from '../lib/runtime.native';
import { StreaksScreen } from './streaks-screen';

const mock = api as unknown as {
  streaks: { getStreakStatus: jest.Mock; getStreakCalendar: jest.Mock };
  gamification: { getXpSummary: jest.Mock; getAchievements: jest.Mock; getXpHistory: jest.Mock };
};

beforeEach(() => {
  back.mockReset();
  mock.streaks.getStreakStatus.mockReset().mockResolvedValue({ currentStreak: 7, longestStreak: 30, atRisk: false, repairEligible: false, repairUsedThisMonth: false });
  mock.streaks.getStreakCalendar.mockReset().mockResolvedValue({ from: '2026-01-01', to: '2026-06-30', activeDays: ['2026-06-29', '2026-06-30'], repairedDays: [] });
  mock.gamification.getXpSummary.mockReset().mockResolvedValue({ balance: 40, totalEarned: 1250, todayEarned: 10 });
  mock.gamification.getAchievements.mockReset().mockResolvedValue({ unlocked: [], locked: [] });
  mock.gamification.getXpHistory.mockReset().mockResolvedValue([{ id: '1', event: 'TRANSACTION_LOGGED', delta: 5, meta: null, createdAt: '2026-06-30T11:00:00Z' }]);
});

describe('StreaksScreen', () => {
  it('loads and shows the overview, stats and XP history', async () => {
    await render(<StreaksScreen />);
    await waitFor(() => expect(screen.getByText('Total days logged')).toBeTruthy());
    expect(screen.getByText('7')).toBeTruthy();          // current streak hero
    expect(screen.getByText('2')).toBeTruthy();          // days logged tile (2 distinct active days)
    expect(screen.getByText('Transaction logged')).toBeTruthy();
  });

  it('goes back when the back button is pressed', async () => {
    await render(<StreaksScreen />);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('shows a section error + retry when the streak group fails', async () => {
    mock.streaks.getStreakStatus.mockRejectedValue(new Error('nope'));
    await render(<StreaksScreen />);
    await waitFor(() => expect(screen.getAllByTestId('section-retry').length).toBeGreaterThan(0));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/screens/streaks-screen.test.tsx`
Expected: FAIL — cannot find module `./streaks-screen`.

- [ ] **Step 3: Write the screen**

```tsx
// apps/mobile/src/screens/streaks-screen.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ApiError } from '@finby/core';
import type { AchievementsResult, StreakCalendar, StreakStatus, XpSummary, XpTransactionView } from '@finby/shared';
import { useAuthStore } from '../lib/use-auth-store';
import { api } from '../lib/runtime.native';
import { SectionCard, SectionError, SectionLoading, type SectionState } from '../components/dashboard/section-card';
import { StreakOverview } from '../components/streak/streak-overview';
import { StreakStatsGrid } from '../components/streak/streak-stats-grid';
import { AchievementsGrid } from '../components/streak/achievements-grid';
import { XpHistory } from '../components/streak/xp-history';
import { useTabBarSpace } from '../components/nav/floating-tab-bar';

const LOADING = { data: null, loading: true, error: null } as const;
function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Could not load this section.';
}

interface StreakGroup {
  status: StreakStatus;
  xp: XpSummary;
  calendar: StreakCalendar;
}

export function StreaksScreen() {
  const workspace = useAuthStore((s) => s.workspace);
  const router = useRouter();
  const tabBarSpace = useTabBarSpace();

  const [streak, setStreak] = useState<SectionState<StreakGroup>>(LOADING);
  const [achievements, setAchievements] = useState<SectionState<AchievementsResult>>(LOADING);
  const [history, setHistory] = useState<SectionState<XpTransactionView[]>>(LOADING);

  const loadStreak = useCallback(() => {
    if (!workspace) return Promise.resolve();
    setStreak(LOADING);
    return Promise.all([
      api.streaks.getStreakStatus(workspace.id),
      api.gamification.getXpSummary(workspace.id),
      api.streaks.getStreakCalendar(workspace.id),
    ])
      .then(([status, xp, calendar]) => setStreak({ data: { status, xp, calendar }, loading: false, error: null }))
      .catch((e) => setStreak({ data: null, loading: false, error: errMsg(e) }));
  }, [workspace]);

  const loadAchievements = useCallback(() => {
    if (!workspace) return Promise.resolve();
    setAchievements(LOADING);
    return api.gamification
      .getAchievements(workspace.id)
      .then((d) => setAchievements({ data: d, loading: false, error: null }))
      .catch((e) => setAchievements({ data: null, loading: false, error: errMsg(e) }));
  }, [workspace]);

  const loadHistory = useCallback(() => {
    if (!workspace) return Promise.resolve();
    setHistory(LOADING);
    return api.gamification
      .getXpHistory(workspace.id)
      .then((d) => setHistory({ data: d, loading: false, error: null }))
      .catch((e) => setHistory({ data: null, loading: false, error: errMsg(e) }));
  }, [workspace]);

  const initialized = useRef(false);
  useEffect(() => {
    if (!workspace || initialized.current) return;
    initialized.current = true;
    void loadStreak();
    void loadAchievements();
    void loadHistory();
  }, [workspace, loadStreak, loadAchievements, loadHistory]);

  const daysLogged = streak.data
    ? new Set([...streak.data.calendar.activeDays, ...streak.data.calendar.repairedDays]).size
    : 0;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <View className="flex-row items-center gap-2 border-b border-line px-4 py-3">
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#e8eef7" />
        </Pressable>
        <Text className="text-lg font-semibold text-ink">Streaks</Text>
      </View>

      <ScrollView contentContainerClassName="gap-6 px-4 py-5" contentContainerStyle={{ paddingBottom: tabBarSpace }}>
        <SectionCard title="Overview">
          {streak.loading ? (
            <SectionLoading />
          ) : streak.error || !streak.data ? (
            <SectionError onRetry={loadStreak} />
          ) : (
            <View className="gap-4">
              <StreakOverview currentStreak={streak.data.status.currentStreak} longestStreak={streak.data.status.longestStreak} />
              <StreakStatsGrid
                longestStreak={streak.data.status.longestStreak}
                daysLogged={daysLogged}
                totalXp={streak.data.xp.totalEarned}
                availableXp={streak.data.xp.balance}
              />
            </View>
          )}
        </SectionCard>

        <SectionCard title="Achievements">
          {achievements.loading ? (
            <SectionLoading />
          ) : achievements.error || !achievements.data ? (
            <SectionError onRetry={loadAchievements} />
          ) : workspace ? (
            <AchievementsGrid workspaceId={workspace.id} achievements={achievements.data} />
          ) : null}
        </SectionCard>

        <SectionCard title="XP history">
          {history.loading ? (
            <SectionLoading />
          ) : history.error || !history.data ? (
            <SectionError onRetry={loadHistory} />
          ) : (
            <XpHistory history={history.data} />
          )}
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Create the route file**

```tsx
// apps/mobile/app/(app)/streaks.tsx
export { StreaksScreen as default } from '../../src/screens/streaks-screen';
```

- [ ] **Step 5: Register the hidden route** — in `apps/mobile/app/(app)/_layout.tsx`, add a `Tabs.Screen` for `streaks` with `href: null` after the `TABS.map(...)`:

```tsx
        {TABS.map((t) => (
          <Tabs.Screen key={t.name} name={t.name} />
        ))}
        <Tabs.Screen name="streaks" options={{ href: null }} />
```

- [ ] **Step 6: Regenerate typed routes, then run test + tsc**

Run:
```bash
cd apps/mobile && EXPO_NO_TELEMETRY=1 CI=1 npx expo start --port 8099 ; echo "(Ctrl-C if it didn't exit on its own)"
pnpm exec jest src/screens/streaks-screen.test.tsx
pnpm exec tsc --noEmit
```
Expected: typegen writes `.expo/types/router.d.ts`; the 3 screen tests pass; tsc clean (the route is now a known href).

- [ ] **Step 7: Lint + commit**

```bash
cd apps/mobile && npx eslint src/screens/streaks-screen.tsx src/screens/streaks-screen.test.tsx
cd /home/unicorn/Documents/finby
git add apps/mobile/src/screens/streaks-screen.tsx apps/mobile/src/screens/streaks-screen.test.tsx "apps/mobile/app/(app)/streaks.tsx" "apps/mobile/app/(app)/_layout.tsx"
git commit -m "feat(mobile): streaks screen (overview/stats/achievements/xp) + hidden route"
```

---

### Task 9: "See full history →" link in the StreakSheet

**Files:**
- Modify: `apps/mobile/src/components/streak/streak-sheet.tsx`
- Modify: `apps/mobile/src/components/streak/streak-sheet.test.tsx`

**Interfaces:**
- Consumes: `useRouter` from `expo-router`.

- [ ] **Step 1: Add a failing test** — append inside the `describe('StreakSheet', …)` block in `streak-sheet.test.tsx`. First add a router mock alongside the existing mocks at the top of the file:

```tsx
const push = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push }) }));
```

Then the test (and reset `push` in `beforeEach` with the others):

```tsx
  it('navigates to the streaks screen and closes from "See full history"', async () => {
    push.mockReset();
    const onClose = jest.fn();
    mock.streaks.getStreakStatus.mockResolvedValue({ currentStreak: 7, longestStreak: 10, atRisk: false, repairEligible: false, repairUsedThisMonth: false });
    await render(<StreakSheet open onClose={onClose} workspaceId="w1" />);
    await waitFor(() => expect(screen.getByText('See full history →')).toBeTruthy());
    await fireEvent.press(screen.getByText('See full history →'));
    expect(push).toHaveBeenCalledWith('/streaks');
    expect(onClose).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/streak/streak-sheet.test.tsx`
Expected: FAIL — no "See full history →" element.

- [ ] **Step 3: Wire the link** — in `streak-sheet.tsx`:
  - Add the import: `import { useRouter } from 'expo-router';`
  - Inside the component, near the other hooks: `const router = useRouter();`
  - Add a footer `Pressable` at the END of the loaded-state `<View className="gap-4 pb-2">` (after the off-screen capture card block), so it shows in every loaded state:

```tsx
          <Pressable
            onPress={() => {
              onClose();
              router.push('/streaks');
            }}
            accessibilityRole="button"
            hitSlop={8}
            className="items-center pt-1"
          >
            <Text className="text-sm font-medium text-accent">See full history →</Text>
          </Pressable>
```
  - Ensure `Pressable` is in the `react-native` import.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/components/streak/streak-sheet.test.tsx`
Expected: PASS (existing + 1 new).

- [ ] **Step 5: Lint + commit**

```bash
cd apps/mobile && npx eslint src/components/streak/streak-sheet.tsx src/components/streak/streak-sheet.test.tsx
cd /home/unicorn/Documents/finby
git add apps/mobile/src/components/streak/streak-sheet.tsx apps/mobile/src/components/streak/streak-sheet.test.tsx
git commit -m "feat(mobile): 'See full history' link from the streak sheet"
```

---

### Task 10: Settings streak-summary row

A row in Settings that shows the current streak + available XP and opens the Streaks screen.

**Files:**
- Modify: `apps/mobile/src/screens/settings-screen.tsx`
- Modify: `apps/mobile/src/screens/settings-screen.test.tsx` (create if absent)

**Interfaces:**
- Consumes: `useRouter` from `expo-router`; `useAuthStore` (already used) for `user.currentStreak`.

- [ ] **Step 1: Write the failing test** — if `settings-screen.test.tsx` doesn't exist, create it; otherwise append. Full file (covers the new row):

```tsx
// apps/mobile/src/screens/settings-screen.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';

const authState = { user: { displayName: 'Tee', currentStreak: 7 }, logout: jest.fn(), resetOnboarding: jest.fn(), lockEnabled: false, setLockEnabled: jest.fn() };
jest.mock('../lib/use-auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector(authState),
}));
const push = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push }) }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { SettingsScreen } from './settings-screen';

describe('SettingsScreen', () => {
  it('opens the streaks screen from the streak row', async () => {
    push.mockReset();
    await render(<SettingsScreen />);
    await fireEvent.press(screen.getByLabelText('View your streak progress'));
    expect(push).toHaveBeenCalledWith('/streaks');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/screens/settings-screen.test.tsx`
Expected: FAIL — no element labelled `View your streak progress`.

- [ ] **Step 3: Add the row** — in `settings-screen.tsx`:
  - Add imports: `import { Pressable } from 'react-native';` (extend the existing `react-native` import to include `Pressable`) and `import { useRouter } from 'expo-router';`
  - In the component: `const router = useRouter();` and read `const currentStreak = useAuthStore((s) => s.user?.currentStreak ?? 0);`
  - Add the row as the first child inside the `<View className="gap-6 p-6">` block (before the "Signed in as" text):

```tsx
        <Pressable
          onPress={() => router.push('/streaks')}
          accessibilityRole="button"
          accessibilityLabel="View your streak progress"
          className="flex-row items-center justify-between rounded-xl border border-line bg-surface px-4 py-3"
        >
          <Text className="text-base text-ink">🔥 {currentStreak}-day streak</Text>
          <Text className="text-sm font-medium text-accent">View progress →</Text>
        </Pressable>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/screens/settings-screen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
cd apps/mobile && npx eslint src/screens/settings-screen.tsx src/screens/settings-screen.test.tsx
cd /home/unicorn/Documents/finby
git add apps/mobile/src/screens/settings-screen.tsx apps/mobile/src/screens/settings-screen.test.tsx
git commit -m "feat(mobile): Settings streak-summary row linking to the streaks screen"
```

---

### Task 11: Full gate + device validation

**Files:** none (verification only).

- [ ] **Step 1: Run the whole gate**

```bash
cd /home/unicorn/Documents/finby
pnpm --filter @finby/shared build
pnpm --filter @finby/shared test
pnpm --filter finby-mobile test
pnpm --filter finby-mobile exec tsc --noEmit
pnpm lint
```
Expected: shared builds + tests pass; mobile tests pass with **pristine output** (0 console/act lines); tsc clean; lint 0 errors (only the pre-existing `sw.js` `_e` warning).

- [ ] **Step 2: Device smoke (user, Expo Go)**

Run: `pnpm --filter finby-mobile start` → open in Expo Go. Verify:
- The chat sheet's "See full history →" and the Settings streak row both open the Streaks screen; back returns.
- Overview (streak + best), stats grid (longest / days logged / total XP / available XP), achievements grid (real badge art; locked dimmed + lock; unlocked show their date), and the XP history feed all render.
- A failed section shows its own Retry.

- [ ] **Step 3: No commit** (verification). Fix any issue under the relevant task and re-run the gate.

---

## Out of scope (later slices)

Calendar heatmap (cut); the milestone-celebration sheet state (slice 2b, via the chat SSE `newAchievements`); the branded achievement-unlock email (backend slice, reuses `apps/api/src/modules/email`); the featured-achievement profile banner; push reminders (Phase 6).
