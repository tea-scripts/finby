# Mobile Phase 5d Slice 1 — Interactive Streak Sheet + Share Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the chat-header streak badge tappable, opening a native StreakSheet (everyday streak states + 10-XP repair + XP card + this-week row) with a "Share" that generates a hero-flame brag-card image.

**Architecture:** Shared pure logic (`streakBand`/`streakCelebration`, `isoWeekDays`) is hoisted into `@finby/shared` so web and mobile consume one copy (mirrors the `password-strength`/`legal` precedent). Mobile-only pure logic (state machine, share-card stats, XP formatter) lives in `apps/mobile/src/lib/streak-view.ts` (Vitest). Presentational pieces are small RN components in `apps/mobile/src/components/streak/*` (RNTL). The sheet reuses the existing `BottomSheet`, `Button`, `api`, and `auth-store`, fetches `streaks` + `gamification` on open, and captures an off-screen card view via `react-native-view-shot` → `expo-sharing`.

**Tech Stack:** Expo SDK 54, React Native 0.81, NativeWind, expo-router, zustand (vanilla store). Tests: Vitest (`*.test.ts`, in `@finby/shared` and mobile) + jest-expo/RNTL (`*.test.tsx`, mobile).

## Global Constraints

- **Branch:** all work on `feat/mobile-phase5d-streak-sheet` (this working tree). Re-orient git state before each task.
- **Rebuild `@finby/shared` after Tasks 1–2.** Mobile (jest/vitest) and web resolve `@finby/shared` from its built `dist`. After changing the shared package, run `pnpm --filter @finby/shared build` before any consumer test/tsc. Tasks 1–2 also run `pnpm --filter finby-web test -- <file>` (or the file's vitest) for the touched web files.
- **Expo Go only** — no native modules beyond `bundledNativeModules.json`. New deps (`react-native-view-shot` 4.0.3, `expo-sharing` ~14.0.8) are bundled; install via `expo install` to pin SDK-54 versions.
- **No Reanimated / no SVG runtime in slice 1** — motion via RN `Animated` only (the `BottomSheet` already handles this).
- **Strict tsconfig** `noUncheckedIndexedAccess` — `arr[0]` is possibly-undefined; guard or `!` it (especially in Vitest array-index assertions).
- **eslint flat config has no react-hooks plugin** — never add `// eslint-disable-line react-hooks/exhaustive-deps` (errors as unknown rule). Loose `.js` files use `globalThis.console`.
- **Mock native-backed modules in tests** — any test whose import tree pulls `react-native-view-shot`, `expo-sharing`, `expo-blur`, or `lottie-react-native` must `jest.mock` them. `@expo/vector-icons` works unmocked in screen tests but mock it in focused component tests that assert icon names.
- **RNTL is async** — `await render(...)`, `await fireEvent.*(...)`, `await renderHook(...)`; wrap `unmount()` in `await act(async () => {...})`.
- **Theme tokens** (`src/theme/tokens.ts`): canvas `#06101f`, surface `#0b1626`, surface-2 `#11203a`, line `#1c2c46`, accent `#1d6ef5`, ink `#e8eef7`, muted `#8da3c0`, faint `#5b6f8c`, **warn (amber)** `#f5a524`, danger `#ef4444`. Use the `warn` class for amber; there is no `amber-*` class.
- **Commit style (HARD RULE):** no AI-attribution trailers / "Generated with" boilerplate. Atomic commits.
- **Gate (run before declaring done):** `pnpm --filter @finby/shared test` · `pnpm --filter finby-mobile test` (pristine, 0 console/act lines) · `pnpm --filter finby-mobile exec tsc --noEmit` (clean) · `pnpm lint` (0 errors; the pre-existing `apps/web/public/sw.js` `_e` warning is OK). Per-task, also run `npx eslint <changed files>`.

---

### Task 1: Hoist `streak-messages` into `@finby/shared`

Move the web's bucketed congratulatory copy into the shared package so mobile and web consume one copy.

**Files:**
- Create: `packages/shared/src/streak-messages.ts`
- Create: `packages/shared/src/streak-messages.test.ts`
- Modify: `packages/shared/src/index.ts` (add an export line)
- Modify: `apps/web/src/lib/streak-messages.ts` (replace body with a re-export shim)
- Keep: `apps/web/src/lib/streak-messages.test.ts` (now exercises the shim — unchanged)

**Interfaces:**
- Produces (from `@finby/shared`): `streakBand(streak: number): string[]`, `streakCelebration(streak: number, rand?: () => number): string`

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/streak-messages.test.ts
import { describe, expect, it } from 'vitest';
import { streakBand, streakCelebration } from './streak-messages';

describe('streakBand', () => {
  it('returns the band for the streak length (highest threshold first)', () => {
    expect(streakBand(0)).toContain('Log a transaction to start your streak! 🔥');
    expect(streakBand(1)[0]).toContain('Day one');
    expect(streakBand(7).some((m) => m.includes('week'))).toBe(true);
    expect(streakBand(400).some((m) => m.includes('year'))).toBe(true);
  });
  it('always returns a non-empty list', () => {
    expect(streakBand(-5).length).toBeGreaterThan(0);
  });
});

describe('streakCelebration', () => {
  it('picks a deterministic message with an injected rng', () => {
    const msgs = streakBand(7);
    expect(streakCelebration(7, () => 0)).toBe(msgs[0]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @finby/shared exec vitest run src/streak-messages.test.ts`
Expected: FAIL — cannot find module `./streak-messages`.

- [ ] **Step 3: Create the shared module** (verbatim port of the current web file)

```ts
// packages/shared/src/streak-messages.ts
/** Congratulatory streak copy, bucketed by streak length. Each band carries a
 *  few variants so the message feels fresh when the user opens the streak UI.
 *  Shared by web (StreakRepair tooltip) and mobile (streak sheet). */
interface StreakBand {
  min: number;
  messages: string[];
}

const BANDS: StreakBand[] = [
  { min: 365, messages: ['A full year of showing up. Legendary. 🏆', '365+ days — this is mastery. Incredible.', 'One year strong. Absolutely unstoppable.'] },
  { min: 100, messages: ['100+ days! You are in rare company. 🔥', 'Triple digits — you are a machine.', 'Over 100 days strong. Phenomenal discipline.', 'Century club. Your future self thanks you.'] },
  { min: 60, messages: ['Two months straight — elite consistency.', '60+ days! This is a real habit now.', 'Two months of showing up. Outstanding work.'] },
  { min: 30, messages: ['A whole month! You built something real. 🎉', '30+ days — this is just who you are now.', 'One month strong. Seriously impressive.', 'A month of discipline. Keep it rolling!'] },
  { min: 14, messages: ['Two weeks in — momentum is on your side.', '14+ days! The habit is taking hold.', 'Two solid weeks. You are crushing it.'] },
  { min: 7, messages: ['A full week! Brilliant start. 🔥', 'Seven days strong — keep the fire going.', 'One week down. You are on a roll!', 'A week of consistency. Well done.'] },
  { min: 2, messages: ['Nice — your streak is building!', 'Back-to-back days. Keep it up!', 'You are stacking days. Love to see it.', 'Momentum is starting — don’t stop now!'] },
  { min: 1, messages: ['Day one — every streak starts here. 🔥', 'You are on the board! See you tomorrow.', 'First day logged. The journey begins.'] },
  { min: 0, messages: ['Log a transaction to start your streak! 🔥', 'No streak yet — log something today to begin.', 'Your streak starts the moment you log a transaction.'] },
];

/** The message variants for a streak length. Always non-empty (final band min:0). */
export function streakBand(streak: number): string[] {
  const band = BANDS.find((b) => streak >= b.min);
  return (band ?? BANDS[BANDS.length - 1]!).messages;
}

/** A single congratulatory message. `rand` is injectable for deterministic tests. */
export function streakCelebration(streak: number, rand: () => number = Math.random): string {
  const messages = streakBand(streak);
  return messages[Math.floor(rand() * messages.length)] ?? messages[0]!;
}
```

- [ ] **Step 4: Export it from the shared index** — add to `packages/shared/src/index.ts` (after the `./legal` line):

```ts
export * from './streak-messages';
```

- [ ] **Step 5: Replace the web file with a shim** — overwrite `apps/web/src/lib/streak-messages.ts` entirely:

```ts
export { streakBand, streakCelebration } from '@finby/shared';
```

- [ ] **Step 6: Build shared, run both test suites**

Run:
```bash
pnpm --filter @finby/shared build
pnpm --filter @finby/shared exec vitest run src/streak-messages.test.ts
pnpm --filter finby-web exec vitest run src/lib/streak-messages.test.ts
```
Expected: shared builds; both suites PASS (the web test now exercises the shim).

- [ ] **Step 7: Lint + commit**

```bash
cd /home/unicorn/Documents/finby
npx eslint packages/shared/src/streak-messages.ts packages/shared/src/streak-messages.test.ts apps/web/src/lib/streak-messages.ts
git add packages/shared/src/streak-messages.ts packages/shared/src/streak-messages.test.ts packages/shared/src/index.ts apps/web/src/lib/streak-messages.ts
git commit -m "refactor(shared): hoist streak celebration copy into @finby/shared"
```

---

### Task 2: Hoist `isoWeekDays` into `@finby/shared` + refactor web WeekRow

The Mon–Sun date math is currently a private function in the web `WeekRow`. Hoist it to shared so both web and mobile use one copy.

**Files:**
- Create: `packages/shared/src/streak-week.ts`
- Create: `packages/shared/src/streak-week.test.ts`
- Modify: `packages/shared/src/index.ts` (add an export line)
- Modify: `apps/web/src/features/gamification/components/WeekRow.tsx` (remove the local `isoWeekDays`, import from `@finby/shared`)

**Interfaces:**
- Produces (from `@finby/shared`): `isoWeekDays(today: string): string[]` — the 7 YYYY-MM-DD dates (Mon–Sun) of the ISO week containing `today`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/streak-week.test.ts
import { describe, expect, it } from 'vitest';
import { isoWeekDays } from './streak-week';

describe('isoWeekDays', () => {
  it('returns Mon–Sun for a midweek date', () => {
    // 2026-06-30 is a Tuesday → Mon 06-29 .. Sun 07-05
    expect(isoWeekDays('2026-06-30')).toEqual([
      '2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05',
    ]);
  });
  it('treats Sunday as the end of its week', () => {
    expect(isoWeekDays('2026-07-05')[0]).toBe('2026-06-29');
    expect(isoWeekDays('2026-07-05')[6]).toBe('2026-07-05');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @finby/shared exec vitest run src/streak-week.test.ts`
Expected: FAIL — cannot find module `./streak-week`.

- [ ] **Step 3: Create the shared module**

```ts
// packages/shared/src/streak-week.ts
const DAY_MS = 86_400_000;

/** The seven YYYY-MM-DD dates of the ISO week (Mon–Sun) containing `today`.
 *  Pure UTC math on the date string, which is already the user's local day. */
export function isoWeekDays(today: string): string[] {
  const [y, m, d] = today.split('-').map(Number);
  const base = Date.UTC(y!, m! - 1, d!);
  const dow = new Date(base).getUTCDay(); // 0=Sun..6=Sat
  const offsetToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = base + offsetToMonday * DAY_MS;
  return Array.from({ length: 7 }, (_, i) => new Date(monday + i * DAY_MS).toISOString().slice(0, 10));
}
```

- [ ] **Step 4: Export from the shared index** — add to `packages/shared/src/index.ts`:

```ts
export * from './streak-week';
```

- [ ] **Step 5: Refactor web WeekRow** — in `apps/web/src/features/gamification/components/WeekRow.tsx`, delete the local `const DAY_MS` and the `function isoWeekDays(...) {...}` block, and add to the imports at the top:

```ts
import { isoWeekDays } from '@finby/shared';
```

(Leave the rest of `WeekRow` unchanged — it still calls `isoWeekDays(today)`.)

- [ ] **Step 6: Build shared, run shared + web WeekRow tests**

Run:
```bash
pnpm --filter @finby/shared build
pnpm --filter @finby/shared exec vitest run src/streak-week.test.ts
pnpm --filter finby-web exec vitest run src/features/gamification/components/WeekRow.test.tsx
```
Expected: shared builds; shared test PASSES; the existing web WeekRow test PASSES (behavior unchanged).

- [ ] **Step 7: Lint + commit**

```bash
cd /home/unicorn/Documents/finby
npx eslint packages/shared/src/streak-week.ts packages/shared/src/streak-week.test.ts apps/web/src/features/gamification/components/WeekRow.tsx
git add packages/shared/src/streak-week.ts packages/shared/src/streak-week.test.ts packages/shared/src/index.ts apps/web/src/features/gamification/components/WeekRow.tsx
git commit -m "refactor(shared): hoist isoWeekDays into @finby/shared, reuse in WeekRow"
```

---

### Task 3: Mobile streak view logic (`streak-view.ts`)

Mobile-only pure logic: the state-machine selector, share-card stat builder, and a thousands formatter. (ISO-week math now comes from `@finby/shared`.)

**Files:**
- Create: `apps/mobile/src/lib/streak-view.ts`
- Test: `apps/mobile/src/lib/streak-view.test.ts`

**Interfaces:**
- Consumes: `StreakStatus`, `StreakCalendar`, `XpSummary`, `ApiUser` from `@finby/shared`.
- Produces:
  - `REPAIR_COST: 10`
  - `streakSheetState(status: StreakStatus, xpBalance: number): 'new' | 'active' | 'recoverable' | 'missed'`
  - `interface ShareCardStats { name: string; streak: number; best: number; xp: number; daysLogged: number }`
  - `shareCardStats(user, status, xp, calendar): ShareCardStats`
  - `formatXp(n: number): string`

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/src/lib/streak-view.test.ts
import { describe, expect, it } from 'vitest';
import type { StreakStatus, StreakCalendar, XpSummary } from '@finby/shared';
import { REPAIR_COST, formatXp, shareCardStats, streakSheetState } from './streak-view';

const status = (over: Partial<StreakStatus> = {}): StreakStatus => ({
  currentStreak: 5, longestStreak: 10, atRisk: false, repairEligible: false, repairUsedThisMonth: false, ...over,
});

describe('streakSheetState', () => {
  it('is "new" at zero streak', () => {
    expect(streakSheetState(status({ currentStreak: 0 }), 100)).toBe('new');
  });
  it('is "active" when streak > 0 and not at risk', () => {
    expect(streakSheetState(status({ atRisk: false }), 0)).toBe('active');
  });
  it('is "recoverable" only when at risk, eligible, and balance >= cost', () => {
    expect(streakSheetState(status({ atRisk: true, repairEligible: true }), REPAIR_COST)).toBe('recoverable');
  });
  it('is "missed" when at risk but balance below cost', () => {
    expect(streakSheetState(status({ atRisk: true, repairEligible: true }), REPAIR_COST - 1)).toBe('missed');
  });
  it('is "missed" when at risk but not repair-eligible', () => {
    expect(streakSheetState(status({ atRisk: true, repairEligible: false }), 999)).toBe('missed');
  });
});

describe('shareCardStats', () => {
  it('builds the brag-card fields and counts distinct logged days', () => {
    const cal: StreakCalendar = {
      from: '2026-01-01', to: '2026-06-30',
      activeDays: ['2026-06-29', '2026-06-30'], repairedDays: ['2026-06-30', '2026-06-28'],
    };
    const xp: XpSummary = { balance: 40, totalEarned: 1250, todayEarned: 10 };
    const stats = shareCardStats({ displayName: 'Timilehin' } as never, status({ currentStreak: 30, longestStreak: 12 }), xp, cal);
    expect(stats).toEqual({ name: 'Timilehin', streak: 30, best: 30, xp: 1250, daysLogged: 3 });
  });
});

describe('formatXp', () => {
  it('groups thousands', () => {
    expect(formatXp(1250)).toBe('1,250');
    expect(formatXp(0)).toBe('0');
    expect(formatXp(1000000)).toBe('1,000,000');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec vitest run src/lib/streak-view.test.ts`
Expected: FAIL — cannot find module `./streak-view`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/mobile/src/lib/streak-view.ts
import type { ApiUser, StreakCalendar, StreakStatus, XpSummary } from '@finby/shared';

/** Fixed XP cost of a streak repair (mirrors the API). */
export const REPAIR_COST = 10;

export type StreakSheetState = 'new' | 'active' | 'recoverable' | 'missed';

/** Which sheet UI to show. `recoverable` needs BOTH repair-eligibility and
 *  enough XP; otherwise an at-risk streak is `missed`. */
export function streakSheetState(status: StreakStatus, xpBalance: number): StreakSheetState {
  if (status.currentStreak === 0) return 'new';
  if (!status.atRisk) return 'active';
  if (status.repairEligible && xpBalance >= REPAIR_COST) return 'recoverable';
  return 'missed';
}

export interface ShareCardStats {
  name: string;
  streak: number;
  best: number;
  xp: number;
  daysLogged: number;
}

/** Build the brag-card fields. `daysLogged` counts distinct dates across active +
 *  repaired days; `best` never reads below the current streak. */
export function shareCardStats(
  user: Pick<ApiUser, 'displayName'>,
  status: StreakStatus,
  xp: XpSummary,
  calendar: StreakCalendar,
): ShareCardStats {
  const days = new Set([...calendar.activeDays, ...calendar.repairedDays]);
  return {
    name: user.displayName,
    streak: status.currentStreak,
    best: Math.max(status.longestStreak, status.currentStreak),
    xp: xp.totalEarned,
    daysLogged: days.size,
  };
}

/** Group thousands with commas, no Intl dependency (Hermes-safe). */
export function formatXp(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec vitest run src/lib/streak-view.test.ts`
Expected: PASS (all groups).

- [ ] **Step 5: Lint + commit**

```bash
cd apps/mobile && npx eslint src/lib/streak-view.ts src/lib/streak-view.test.ts
cd /home/unicorn/Documents/finby
git add apps/mobile/src/lib/streak-view.ts apps/mobile/src/lib/streak-view.test.ts
git commit -m "feat(mobile): streak sheet state machine + share-card logic"
```

---

### Task 4: WeekRow component

A Mon–Sun activity strip of circular indicators.

**Files:**
- Create: `apps/mobile/src/components/streak/week-row.tsx`
- Test: `apps/mobile/src/components/streak/week-row.test.tsx`

**Interfaces:**
- Consumes: `isoWeekDays` from `@finby/shared`.
- Produces: `WeekRow({ activeDays: string[]; repairedDays: string[]; today: string })`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/streak/week-row.test.tsx
import { render, screen } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));

import { WeekRow } from './week-row';

describe('WeekRow', () => {
  it('marks active and repaired days with a check and shows weekday labels', async () => {
    await render(<WeekRow activeDays={['2026-06-29']} repairedDays={['2026-06-30']} today="2026-06-30" />);
    expect(screen.getAllByText('checkmark')).toHaveLength(2);
    expect(screen.getAllByText('M').length).toBeGreaterThan(0);
  });

  it('shows the day number for a future day', async () => {
    await render(<WeekRow activeDays={[]} repairedDays={[]} today="2026-06-29" />);
    // 2026-06-29 is Monday → Sunday 07-05 is future → shows "5".
    expect(screen.getByText('5')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/streak/week-row.test.tsx`
Expected: FAIL — cannot find module `./week-row`.

- [ ] **Step 3: Write the implementation**

```tsx
// apps/mobile/src/components/streak/week-row.tsx
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { isoWeekDays } from '@finby/shared';

const LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** A Mon–Sun strip showing which days of the current week were logged. `today`
 *  is the user's local today (YYYY-MM-DD) — the calendar's `to` — so no tz math. */
export function WeekRow({
  activeDays,
  repairedDays,
  today,
}: {
  activeDays: string[];
  repairedDays: string[];
  today: string;
}) {
  const active = new Set([...activeDays, ...repairedDays]);
  const days = isoWeekDays(today);

  return (
    <View className="w-full flex-row justify-between" accessibilityRole="list">
      {days.map((date, i) => {
        const isActive = active.has(date);
        const isToday = date === today;
        const isFuture = date > today;
        const dayNum = Number(date.slice(8, 10));
        const circle = isActive ? 'bg-warn' : isToday ? 'border-2 border-warn' : 'border border-line';
        return (
          <View key={date} className="items-center gap-1" accessibilityRole="text">
            <Text className="text-xs text-muted">{LABELS[i]}</Text>
            <View className={`h-8 w-8 items-center justify-center rounded-full ${circle}`}>
              {isActive ? (
                <Ionicons name="checkmark" size={16} color="#ffffff" />
              ) : isFuture ? (
                <Text className="text-xs text-faint">{dayNum}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/components/streak/week-row.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Lint + commit**

```bash
cd apps/mobile && npx eslint src/components/streak/week-row.tsx src/components/streak/week-row.test.tsx
cd /home/unicorn/Documents/finby
git add apps/mobile/src/components/streak/week-row.tsx apps/mobile/src/components/streak/week-row.test.tsx
git commit -m "feat(mobile): WeekRow Mon-Sun streak activity strip"
```

---

### Task 5: StreakShareCard component

The off-screen hero-flame brag card that gets captured to a PNG.

**Files:**
- Create: `apps/mobile/src/components/streak/streak-share-card.tsx`
- Test: `apps/mobile/src/components/streak/streak-share-card.test.tsx`

**Interfaces:**
- Consumes: `ShareCardStats`, `formatXp` from `../../lib/streak-view`; `Wordmark` from `../ui/wordmark`.
- Produces: `StreakShareCard({ stats: ShareCardStats })`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/streak/streak-share-card.test.tsx
import { render, screen } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));
jest.mock('../ui/wordmark', () => ({ Wordmark: () => null }));

import { StreakShareCard } from './streak-share-card';

describe('StreakShareCard', () => {
  it('renders the name, streak and stats', async () => {
    await render(<StreakShareCard stats={{ name: 'Timilehin', streak: 30, best: 30, xp: 1250, daysLogged: 48 }} />);
    expect(screen.getByText('Timilehin')).toBeTruthy();
    expect(screen.getByText('30')).toBeTruthy();
    expect(screen.getByText(/1,250 XP/)).toBeTruthy();
    expect(screen.getByText(/48 days logged/)).toBeTruthy();
    expect(screen.getByText('finby.app')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/streak/streak-share-card.test.tsx`
Expected: FAIL — cannot find module `./streak-share-card`.

- [ ] **Step 3: Write the implementation**

```tsx
// apps/mobile/src/components/streak/streak-share-card.tsx
import { Platform, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Wordmark } from '../ui/wordmark';
import { formatXp, type ShareCardStats } from '../../lib/streak-view';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

/** The hero-flame brag card. Fixed 320×400 with an explicit dark background so
 *  the captured PNG is opaque. Rendered off-screen by StreakSheet for capture. */
export function StreakShareCard({ stats }: { stats: ShareCardStats }) {
  return (
    <View style={{ width: 320, height: 400 }} className="justify-between rounded-3xl bg-canvas p-6">
      <View className="flex-row items-center justify-between">
        <Wordmark height={18} />
        <Ionicons name="flame" size={20} color="#f5a524" />
      </View>

      <View className="items-center gap-1">
        <Ionicons name="flame" size={56} color="#f5a524" />
        <Text className="text-warn" style={{ fontFamily: MONO, fontSize: 64, fontWeight: '800' }}>
          {stats.streak}
        </Text>
        <Text className="text-base text-muted">day streak</Text>
      </View>

      <View className="gap-1">
        <Text className="text-lg font-semibold text-ink">{stats.name}</Text>
        <Text className="text-sm text-muted">best {stats.best} · ⚡ {formatXp(stats.xp)} XP</Text>
        <Text className="text-sm text-muted">{stats.daysLogged} days logged</Text>
      </View>

      <Text className="text-xs text-faint">finby.app</Text>
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/components/streak/streak-share-card.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Lint + commit**

```bash
cd apps/mobile && npx eslint src/components/streak/streak-share-card.tsx src/components/streak/streak-share-card.test.tsx
cd /home/unicorn/Documents/finby
git add apps/mobile/src/components/streak/streak-share-card.tsx apps/mobile/src/components/streak/streak-share-card.test.tsx
git commit -m "feat(mobile): hero-flame streak share card"
```

---

### Task 6: auth-store `setStreak` action

Lets the sheet push a repaired streak back to the cached user so the header badge updates.

**Files:**
- Modify: `apps/mobile/src/lib/auth-store.ts` (add to `AuthState` interface + store body)
- Test: `apps/mobile/src/lib/auth-store.test.ts` (add two cases)

**Interfaces:**
- Produces: `setStreak(currentStreak: number, longestStreak: number): void` on `AuthState`.

- [ ] **Step 1: Write the failing test** (append inside the `describe('createAuthStore', …)` block)

```ts
  it('setStreak updates the cached user streak counters', async () => {
    const store = makeStore();
    await store.getState().login('e@x.com', 'pw');
    store.getState().setStreak(12, 30);
    expect(store.getState().user).toMatchObject({ currentStreak: 12, longestStreak: 30 });
  });

  it('setStreak is a no-op when there is no user', () => {
    const store = makeStore();
    store.getState().setStreak(5, 5);
    expect(store.getState().user).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec vitest run src/lib/auth-store.test.ts`
Expected: FAIL — `setStreak` is not a function.

- [ ] **Step 3: Write the implementation**

In `AuthState` (after `verifyPin`):

```ts
  /** Update the cached user's streak counters (after a repair) so the badge reflects it. */
  setStreak(currentStreak: number, longestStreak: number): void;
```

In the store body (after `verifyPin: (pin) => lockCode.verify(pin),`):

```ts
    setStreak: (currentStreak, longestStreak) =>
      set((s) => (s.user ? { user: { ...s.user, currentStreak, longestStreak } } : {})),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec vitest run src/lib/auth-store.test.ts`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Lint + commit**

```bash
cd apps/mobile && npx eslint src/lib/auth-store.ts src/lib/auth-store.test.ts
cd /home/unicorn/Documents/finby
git add apps/mobile/src/lib/auth-store.ts apps/mobile/src/lib/auth-store.test.ts
git commit -m "feat(mobile): auth-store setStreak action for badge sync"
```

---

### Task 7: Make StreakBadge tappable

Add an optional `onPress` so the chat header can open the sheet. No visual change when omitted.

**Files:**
- Modify: `apps/mobile/src/components/dashboard/streak-badge.tsx`
- Test: `apps/mobile/src/components/dashboard/streak-badge.test.tsx` (update import + add one case)

**Interfaces:**
- Produces: `StreakBadge({ streak: number; onPress?: () => void })`

- [ ] **Step 1: Write the failing test**

First update the top import to add `fireEvent`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
```

Then append inside the existing `describe`:

```tsx
  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(<StreakBadge streak={5} onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/dashboard/streak-badge.test.tsx`
Expected: FAIL — no element with role `button`.

- [ ] **Step 3: Write the implementation**

```tsx
// apps/mobile/src/components/dashboard/streak-badge.tsx
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/** Streak indicator (flame + day count). Tappable when `onPress` is provided. */
export function StreakBadge({ streak, onPress }: { streak: number; onPress?: () => void }) {
  const body = (
    <View className="flex-row items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5">
      <Ionicons name="flame" size={16} color="#f5a524" />
      <Text className="text-sm font-semibold text-ink">{streak}</Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="View your streak" hitSlop={8}>
      {body}
    </Pressable>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/components/dashboard/streak-badge.test.tsx`
Expected: PASS (existing + 1 new).

- [ ] **Step 5: Lint + commit**

```bash
cd apps/mobile && npx eslint src/components/dashboard/streak-badge.tsx src/components/dashboard/streak-badge.test.tsx
cd /home/unicorn/Documents/finby
git add apps/mobile/src/components/dashboard/streak-badge.tsx apps/mobile/src/components/dashboard/streak-badge.test.tsx
git commit -m "feat(mobile): make StreakBadge tappable via optional onPress"
```

---

### Task 8: Install capture + share deps and verify the bundle

**Files:**
- Modify: `apps/mobile/package.json` (via `expo install`), root `pnpm-lock.yaml`.

- [ ] **Step 1: Install (SDK-pinned)**

Run: `cd apps/mobile && pnpm exec expo install react-native-view-shot expo-sharing`
Expected: adds `react-native-view-shot@4.0.3` and `expo-sharing@~14.0.8` (the versions in Expo Go's `bundledNativeModules.json`).

- [ ] **Step 2: Verify the JS bundle is SharedArrayBuffer-clean** (no device needed)

Run:
```bash
cd apps/mobile && pnpm exec expo export:embed --platform ios --dev false --bundle-output /tmp/b.js && grep -c "SharedArrayBuffer.prototype" /tmp/b.js
```
Expected: bundle writes; grep prints `0` (clean). If `expo export:embed` hangs >2 min, Ctrl-C — the install is the deliverable; re-run the bundle check later.

- [ ] **Step 3: Commit**

```bash
cd /home/unicorn/Documents/finby
git add apps/mobile/package.json pnpm-lock.yaml
git commit -m "build(mobile): add react-native-view-shot + expo-sharing (Expo Go bundled)"
```

---

### Task 9: StreakSheet component

The interactive sheet: fetch on open, state machine, repair, share, loading/error.

**Files:**
- Create: `apps/mobile/src/components/streak/streak-sheet.tsx`
- Test: `apps/mobile/src/components/streak/streak-sheet.test.tsx`

**Interfaces:**
- Consumes: `BottomSheet` (`../ui/bottom-sheet`), `Button` (`../ui/button`), `WeekRow`, `StreakShareCard`, `REPAIR_COST`/`shareCardStats`/`streakSheetState`/`ShareCardStats` (`../../lib/streak-view`), `streakCelebration` (`@finby/shared`), `chatNotice` (`../../lib/chat-notice`), `useAuthStore` (`../../lib/use-auth-store`), `api` (`../../lib/runtime.native`). Calls `api.streaks.getStreakStatus|repairStreak|getStreakCalendar`, `api.gamification.getXpSummary`. `captureRef` (`react-native-view-shot`), `Sharing` (`expo-sharing`).
- Produces: `StreakSheet({ open: boolean; onClose: () => void; workspaceId: string })`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/streak/streak-sheet.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const authState = { user: { displayName: 'Tee', currentStreak: 5, longestStreak: 10 }, setStreak: jest.fn() };
jest.mock('../../lib/use-auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector(authState),
}));
jest.mock('../../lib/runtime.native', () => ({
  api: {
    streaks: { getStreakStatus: jest.fn(), repairStreak: jest.fn(), getStreakCalendar: jest.fn() },
    gamification: { getXpSummary: jest.fn() },
  },
}));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(async () => 'file://card.png') }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => {}) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));
jest.mock('../ui/wordmark', () => ({ Wordmark: () => null }));

import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { api } from '../../lib/runtime.native';
import { StreakSheet } from './streak-sheet';

const mock = api as unknown as {
  streaks: { getStreakStatus: jest.Mock; repairStreak: jest.Mock; getStreakCalendar: jest.Mock };
  gamification: { getXpSummary: jest.Mock };
};
const CAL = { from: '2026-01-01', to: '2026-06-30', activeDays: ['2026-06-30'], repairedDays: [] };

beforeEach(() => {
  authState.setStreak.mockReset();
  mock.streaks.getStreakStatus.mockReset();
  mock.streaks.repairStreak.mockReset();
  mock.streaks.getStreakCalendar.mockReset().mockResolvedValue(CAL);
  mock.gamification.getXpSummary.mockReset().mockResolvedValue({ balance: 40, totalEarned: 1250, todayEarned: 10 });
  (captureRef as jest.Mock).mockClear();
  (Sharing.shareAsync as jest.Mock).mockClear();
});

describe('StreakSheet', () => {
  it('shows the active state with a Share button', async () => {
    mock.streaks.getStreakStatus.mockResolvedValue({ currentStreak: 7, longestStreak: 10, atRisk: false, repairEligible: false, repairUsedThisMonth: false });
    await render(<StreakSheet open onClose={jest.fn()} workspaceId="w1" />);
    await waitFor(() => expect(screen.getByText('Share your streak')).toBeTruthy());
    expect(screen.getByText('7')).toBeTruthy();
  });

  it('repairs a recoverable streak and syncs the badge', async () => {
    mock.streaks.getStreakStatus.mockResolvedValue({ currentStreak: 6, longestStreak: 10, atRisk: true, repairEligible: true, repairUsedThisMonth: false });
    mock.streaks.repairStreak.mockResolvedValue({ currentStreak: 7, longestStreak: 10, atRisk: false, repairEligible: false, repairUsedThisMonth: false });
    await render(<StreakSheet open onClose={jest.fn()} workspaceId="w1" />);
    await waitFor(() => expect(screen.getByTestId('streak-repair')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('streak-repair'));
    await waitFor(() => expect(mock.streaks.repairStreak).toHaveBeenCalledWith('w1'));
    expect(authState.setStreak).toHaveBeenCalledWith(7, 10);
  });

  it('disables repair when the streak is missed and XP is short', async () => {
    mock.gamification.getXpSummary.mockResolvedValue({ balance: 3, totalEarned: 100, todayEarned: 0 });
    mock.streaks.getStreakStatus.mockResolvedValue({ currentStreak: 6, longestStreak: 10, atRisk: true, repairEligible: true, repairUsedThisMonth: false });
    await render(<StreakSheet open onClose={jest.fn()} workspaceId="w1" />);
    await waitFor(() => expect(screen.getByTestId('streak-repair-disabled')).toBeTruthy());
    expect(screen.getByText(/more XP to recover/)).toBeTruthy();
  });

  it('captures the card and opens the share sheet', async () => {
    mock.streaks.getStreakStatus.mockResolvedValue({ currentStreak: 7, longestStreak: 10, atRisk: false, repairEligible: false, repairUsedThisMonth: false });
    await render(<StreakSheet open onClose={jest.fn()} workspaceId="w1" />);
    await waitFor(() => expect(screen.getByTestId('streak-share')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('streak-share'));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledWith('file://card.png'));
  });

  it('shows an error with retry when the fetch fails', async () => {
    mock.streaks.getStreakStatus.mockRejectedValue(new Error('nope'));
    await render(<StreakSheet open onClose={jest.fn()} workspaceId="w1" />);
    await waitFor(() => expect(screen.getByText('Retry')).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/streak/streak-sheet.test.tsx`
Expected: FAIL — cannot find module `./streak-sheet`.

- [ ] **Step 3: Write the implementation**

```tsx
// apps/mobile/src/components/streak/streak-sheet.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { streakCelebration, type StreakCalendar, type StreakStatus, type XpSummary } from '@finby/shared';
import { BottomSheet } from '../ui/bottom-sheet';
import { Button } from '../ui/button';
import { WeekRow } from './week-row';
import { StreakShareCard } from './streak-share-card';
import { REPAIR_COST, shareCardStats, streakSheetState, type ShareCardStats } from '../../lib/streak-view';
import { chatNotice } from '../../lib/chat-notice';
import { useAuthStore } from '../../lib/use-auth-store';
import { api } from '../../lib/runtime.native';

/** Interactive streak sheet: fetches status/xp/calendar on open, drives the
 *  everyday state machine (new/active/recoverable/missed), repairs for 10 XP,
 *  and shares a generated brag card. Milestone + full history are slice 2. */
export function StreakSheet({ open, onClose, workspaceId }: { open: boolean; onClose: () => void; workspaceId: string }) {
  const user = useAuthStore((s) => s.user);
  const setStreak = useAuthStore((s) => s.setStreak);
  const [status, setStatus] = useState<StreakStatus | null>(null);
  const [xp, setXp] = useState<XpSummary | null>(null);
  const [calendar, setCalendar] = useState<StreakCalendar | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repairing, setRepairing] = useState(false);
  const cardRef = useRef<View>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, x, c] = await Promise.all([
        api.streaks.getStreakStatus(workspaceId),
        api.gamification.getXpSummary(workspaceId),
        api.streaks.getStreakCalendar(workspaceId),
      ]);
      setStatus(s);
      setXp(x);
      setCalendar(c);
    } catch (err) {
      setError(chatNotice(err).message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function repair() {
    setRepairing(true);
    setError(null);
    try {
      const next = await api.streaks.repairStreak(workspaceId);
      setStatus(next);
      setStreak(next.currentStreak, next.longestStreak);
      setXp(await api.gamification.getXpSummary(workspaceId));
    } catch (err) {
      setError(chatNotice(err).message);
    } finally {
      setRepairing(false);
    }
  }

  async function share() {
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
    } catch (err) {
      setError(chatNotice(err).message);
    }
  }

  const state = status && xp ? streakSheetState(status, xp.balance) : null;
  const stats: ShareCardStats | null =
    status && xp && calendar && user ? shareCardStats(user, status, xp, calendar) : null;

  return (
    <BottomSheet open={open} onClose={onClose} title="Your streak">
      {loading ? (
        <View className="items-center py-10">
          <ActivityIndicator color="#1d6ef5" />
        </View>
      ) : error && !status ? (
        <View className="items-center gap-3 py-8">
          <Text className="text-center text-sm text-muted">{error}</Text>
          <Button variant="ghost" onPress={() => void load()}>
            Retry
          </Button>
        </View>
      ) : status && xp && calendar && state ? (
        <View className="gap-4 pb-2">
          <View className="items-center gap-1">
            <Ionicons name="flame" size={40} color="#f5a524" />
            <Text className="text-3xl font-bold text-ink">{status.currentStreak}</Text>
            <Text className="text-sm text-muted">{status.currentStreak === 1 ? 'day' : 'days'} streak</Text>
          </View>

          {state === 'new' ? (
            <Text className="text-center text-sm text-muted">Log a transaction to start your streak 🔥</Text>
          ) : state === 'active' ? (
            <Text className="text-center text-sm text-muted">{streakCelebration(status.currentStreak)}</Text>
          ) : (
            <Text className="text-center text-sm text-warn">You missed yesterday — your streak is at risk.</Text>
          )}

          <WeekRow activeDays={calendar.activeDays} repairedDays={calendar.repairedDays} today={calendar.to} />

          {state !== 'new' ? (
            <View className="flex-row justify-between rounded-xl border border-line bg-surface-2 px-4 py-3">
              <Text className="text-sm text-muted">
                Today <Text className="text-ink">+{xp.todayEarned}</Text>
              </Text>
              <Text className="text-sm text-muted">
                Total <Text className="text-ink">{xp.balance} XP</Text>
              </Text>
            </View>
          ) : null}

          {state === 'recoverable' ? (
            <Button onPress={() => void repair()} loading={repairing} testID="streak-repair">
              {`Recover streak — ${REPAIR_COST} XP`}
            </Button>
          ) : state === 'missed' ? (
            <Button disabled testID="streak-repair-disabled">
              {status.repairUsedThisMonth ? 'Repair used this month' : `Need ${REPAIR_COST - xp.balance} more XP to recover`}
            </Button>
          ) : state === 'active' ? (
            <Button variant="ghost" onPress={() => void share()} testID="streak-share">
              Share your streak
            </Button>
          ) : null}

          {error && status ? <Text className="text-center text-xs text-danger">{error}</Text> : null}

          {stats ? (
            <View ref={cardRef} collapsable={false} style={{ position: 'absolute', left: -9999, top: 0 }}>
              <StreakShareCard stats={stats} />
            </View>
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/components/streak/streak-sheet.test.tsx`
Expected: PASS (5 tests). A benign `act(...)` warning for state settling after `waitFor` is filtered by the existing `jest.setup.js`; genuine warnings still surface.

- [ ] **Step 5: Lint + commit**

```bash
cd apps/mobile && npx eslint src/components/streak/streak-sheet.tsx src/components/streak/streak-sheet.test.tsx
cd /home/unicorn/Documents/finby
git add apps/mobile/src/components/streak/streak-sheet.tsx apps/mobile/src/components/streak/streak-sheet.test.tsx
git commit -m "feat(mobile): interactive streak sheet (states, repair, share)"
```

---

### Task 10: Wire the sheet into the chat header

Open the sheet when the header badge is tapped.

**Files:**
- Modify: `apps/mobile/src/screens/chat-screen.tsx`
- Modify: `apps/mobile/src/screens/chat-screen.test.tsx` (add native-module mocks + extend the api mock + a tap test)

**Interfaces:**
- Consumes: `StreakSheet` (`../components/streak/streak-sheet`).

- [ ] **Step 1: Add mocks + a failing test** to `chat-screen.test.tsx`

Add these native-module mocks alongside the existing ones (top of file):

```tsx
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(async () => 'file://card.png') }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => {}) }));
```

Replace the existing `jest.mock('../lib/runtime.native', …)` factory so the sheet's fetch resolves cleanly:

```tsx
jest.mock('../lib/runtime.native', () => ({
  api: {
    chat: {
      listConversations: jest.fn(),
      createConversation: jest.fn(),
      listMessages: jest.fn(),
      streamMessage: jest.fn(),
    },
    streaks: {
      getStreakStatus: jest.fn(async () => ({ currentStreak: 7, longestStreak: 10, atRisk: false, repairEligible: false, repairUsedThisMonth: false })),
      repairStreak: jest.fn(),
      getStreakCalendar: jest.fn(async () => ({ from: '2026-01-01', to: '2026-06-30', activeDays: [], repairedDays: [] })),
    },
    gamification: { getXpSummary: jest.fn(async () => ({ balance: 40, totalEarned: 1250, todayEarned: 10 })) },
  },
}));
```

Add a test inside `describe('ChatScreen', …)`:

```tsx
  it('opens the streak sheet when the header badge is tapped', async () => {
    await render(<ChatScreen />);
    await waitFor(() => expect(mockChat.listMessages).toHaveBeenCalled());
    await fireEvent.press(screen.getByLabelText('View your streak'));
    await waitFor(() => expect(screen.getByText('Your streak')).toBeTruthy());
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/screens/chat-screen.test.tsx`
Expected: FAIL — no element labelled `View your streak`.

- [ ] **Step 3: Wire the screen**

Add the import (near the other component imports):

```tsx
import { StreakSheet } from '../components/streak/streak-sheet';
```

Add open-state next to the other `useState`s in `ChatScreen`:

```tsx
  const [streakOpen, setStreakOpen] = useState(false);
```

Pass `onPress` to the header badge (replace the existing `<StreakBadge … />` line):

```tsx
          <StreakBadge streak={user?.currentStreak ?? 0} onPress={() => setStreakOpen(true)} />
```

Render the sheet — add just before the closing `</SafeAreaView>` (after `</KeyboardAvoidingView>`):

```tsx
      {workspace ? (
        <StreakSheet open={streakOpen} onClose={() => setStreakOpen(false)} workspaceId={workspace.id} />
      ) : null}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/screens/chat-screen.test.tsx`
Expected: PASS (existing + 1 new).

- [ ] **Step 5: Lint + commit**

```bash
cd apps/mobile && npx eslint src/screens/chat-screen.tsx src/screens/chat-screen.test.tsx
cd /home/unicorn/Documents/finby
git add apps/mobile/src/screens/chat-screen.tsx apps/mobile/src/screens/chat-screen.test.tsx
git commit -m "feat(mobile): open streak sheet from the chat header badge"
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
- Tapping the chat-header flame opens the sheet over the chat.
- Active state shows the streak number, a tier message, the Mon–Sun row, the XP card, and "Share your streak".
- "Share your streak" opens the native share sheet with the hero-flame card image (name, streak, best, XP, days logged, finby.app).
- If at risk with ≥10 XP: "Recover streak — 10 XP" works and the header count updates; if short on XP: the disabled message shows.

- [ ] **Step 3: No commit** (verification task). If the device smoke surfaces issues, fix under the relevant task and re-run the gate.

---

## Out of scope (slice 2 / later)

Full Streaks screen (overview, stats grid, ~6-month calendar heatmap, achievements grid, XP history), the milestone-celebration state + achievement badge SVGs (`react-native-svg`, also Expo-Go-bundled), push reminders / `StreakStartPrompt`, the Settings streak-summary row, the sheet "See full history →" link, and an at-risk ring on the header badge.
