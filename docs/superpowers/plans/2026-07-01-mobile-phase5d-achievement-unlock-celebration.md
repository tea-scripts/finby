# Mobile Phase 5d Slice 2b — Achievement Unlock Celebration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a chat-logged transaction unlocks an achievement, show a confetti celebration modal (badge + label + tier + haptic + Share).

**Architecture:** `chat-screen` collects `newAchievements` from the streaming `onAction`, and after the stream completes queues them into a celebration state. A centered RN `Modal` (`AchievementUnlockedModal`) shows each in turn with `react-native-confetti-cannon`, an `expo-haptics` success buzz, the cached `BadgeImage`, a shared `TierChip`, Continue, and a text Share.

**Tech Stack:** Expo SDK 54, RN 0.81, NativeWind. New deps: `react-native-confetti-cannon` (pure-JS), `expo-haptics` (~15.0.8, Expo-Go-bundled). Tests: jest-expo/RNTL.

## Global Constraints

- **Branch:** all work on `feat/mobile-phase5d-unlock-celebration` (this working tree). Re-orient git state before each task.
- **Expo Go only** — `react-native-confetti-cannon` is pure JS (no native module); `expo-haptics` 15.0.8 is in `bundledNativeModules.json`. Install both via `expo install`.
- **Mock native-ish modules in tests** — any test whose import tree pulls `react-native-confetti-cannon`, the haptics wrapper, `react-native-svg` (via BadgeImage), `expo-blur`, `react-native-view-shot`, or `expo-sharing` must `jest.mock` them.
- **RNTL is async** — `await render(...)`, `await fireEvent.*(...)`, `waitFor`.
- **Open the modal only AFTER the stream completes** — never mid-reply.
- **Share copy (verbatim):** `I just unlocked "{label}" on Finby!` (matches web).
- **Strict tsconfig** `noUncheckedIndexedAccess`. eslint flat config has no react-hooks plugin (no exhaustive-deps disable comment).
- **Theme tokens** (`src/theme/tokens.ts`): canvas `#06101f`, surface `#0b1626`, line `#1c2c46`, accent `#1d6ef5`, ink `#e8eef7`, muted `#8da3c0`. Tier colors: Bronze `#cd7f32`, Silver `#c0c0c0`, Gold `#f5a524`; fallback `#8da3c0`.
- **Commit style (HARD RULE):** no AI-attribution trailers / boilerplate. Atomic commits.
- **Gate:** `pnpm --filter finby-mobile test` (pristine) · `pnpm --filter finby-mobile exec tsc --noEmit` · `pnpm lint` (0 errors; pre-existing `sw.js` `_e` warning OK). Per-task: `npx eslint <changed files>`.

---

### Task 1: Install confetti + haptics deps and verify the bundle

**Files:** Modify `apps/mobile/package.json` (via `expo install`), root `pnpm-lock.yaml`.

- [ ] **Step 1: Install**

Run: `cd apps/mobile && pnpm exec expo install react-native-confetti-cannon expo-haptics`
Expected: adds `react-native-confetti-cannon` (latest pure-JS) and `expo-haptics@~15.0.8` (the Expo-Go-bundled SDK-54 version).

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
git commit -m "build(mobile): add react-native-confetti-cannon + expo-haptics"
```

---

### Task 2: Extract a shared `TierChip`

The tier pill is currently inline in `achievement-sheet.tsx`; extract it so the celebration modal reuses it (no duplicate tier map).

**Files:**
- Create: `apps/mobile/src/components/streak/tier-chip.tsx`, `apps/mobile/src/components/streak/tier-chip.test.tsx`
- Modify: `apps/mobile/src/components/streak/achievement-sheet.tsx` (use `TierChip`, drop the inline chip + tier maps)

**Interfaces:**
- Produces: `TierChip({ tier: string })`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/streak/tier-chip.test.tsx
import { render, screen } from '@testing-library/react-native';
import { TierChip } from './tier-chip';

describe('TierChip', () => {
  it('renders the capitalized tier label', async () => {
    await render(<TierChip tier="BRONZE" />);
    expect(screen.getByText('Bronze')).toBeTruthy();
  });

  it('falls back to the raw tier for an unknown value', async () => {
    await render(<TierChip tier="PLATINUM" />);
    expect(screen.getByText('PLATINUM')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/streak/tier-chip.test.tsx`
Expected: FAIL — cannot find module `./tier-chip`.

- [ ] **Step 3: Write the implementation**

```tsx
// apps/mobile/src/components/streak/tier-chip.tsx
import { Text, View } from 'react-native';

const TIER_LABEL: Record<string, string> = { BRONZE: 'Bronze', SILVER: 'Silver', GOLD: 'Gold' };
const TIER_COLOR: Record<string, string> = { BRONZE: '#cd7f32', SILVER: '#c0c0c0', GOLD: '#f5a524' };

/** A small tier pill (Bronze/Silver/Gold), tier-colored. */
export function TierChip({ tier }: { tier: string }) {
  const color = TIER_COLOR[tier] ?? '#8da3c0';
  return (
    <View className="rounded-full border px-2.5 py-0.5" style={{ borderColor: color }}>
      <Text className="text-xs font-semibold" style={{ color }}>
        {TIER_LABEL[tier] ?? tier}
      </Text>
    </View>
  );
}
```

- [ ] **Step 4: Refactor `achievement-sheet.tsx`** to use it — replace the inline tier maps + chip. The file becomes:

```tsx
// apps/mobile/src/components/streak/achievement-sheet.tsx
import { Text, View } from 'react-native';
import { relativeTime, type AchievementDefView } from '@finby/shared';
import { BottomSheet } from '../ui/bottom-sheet';
import { BadgeImage } from './badge-image';
import { TierChip } from './tier-chip';

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
          <TierChip tier={achievement.tier} />
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

- [ ] **Step 5: Run tests** (new TierChip + the unchanged achievement-sheet test, which still asserts the `Bronze` chip)

Run: `cd apps/mobile && pnpm exec jest src/components/streak/tier-chip.test.tsx src/components/streak/achievement-sheet.test.tsx`
Expected: PASS (tier-chip 2 + achievement-sheet 3).

- [ ] **Step 6: Lint + commit**

```bash
cd apps/mobile && npx eslint src/components/streak/tier-chip.tsx src/components/streak/tier-chip.test.tsx src/components/streak/achievement-sheet.tsx
cd /home/unicorn/Documents/finby
git add apps/mobile/src/components/streak/tier-chip.tsx apps/mobile/src/components/streak/tier-chip.test.tsx apps/mobile/src/components/streak/achievement-sheet.tsx
git commit -m "refactor(mobile): extract shared TierChip from the achievement sheet"
```

---

### Task 3: Haptics wrapper + `AchievementUnlockedModal`

**Files:**
- Create: `apps/mobile/src/lib/haptics.ts`
- Create: `apps/mobile/src/components/chat/achievement-unlocked-modal.tsx`, `apps/mobile/src/components/chat/achievement-unlocked-modal.test.tsx`

**Interfaces:**
- Consumes: `BadgeImage` (`../streak/badge-image`), `TierChip` (`../streak/tier-chip`), `Button` (`../ui/button`), `celebrateHaptic` (`../../lib/haptics`), `NewAchievement` (`@finby/shared`), `react-native-confetti-cannon`, RN `Share`.
- Produces: `celebrateHaptic(): void`; `AchievementUnlockedModal({ workspaceId: string; achievement: NewAchievement | null; remaining: number; onContinue: () => void })`.

- [ ] **Step 1: Write the haptics wrapper** (a thin native call — no unit test; it is exercised via the modal test mock)

```ts
// apps/mobile/src/lib/haptics.ts
import * as Haptics from 'expo-haptics';

/** A success haptic for celebratory moments (achievement unlocks). Best-effort:
 *  haptics aren't available on every device/simulator, so failures are swallowed. */
export function celebrateHaptic(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
```

- [ ] **Step 2: Write the failing modal test**

```tsx
// apps/mobile/src/components/chat/achievement-unlocked-modal.test.tsx
import { Share } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';

const celebrateHaptic = jest.fn();
jest.mock('../../lib/haptics', () => ({ celebrateHaptic: () => celebrateHaptic() }));
jest.mock('react-native-confetti-cannon', () => () =>
  jest.requireActual<typeof import('react')>('react').createElement('Text', null, 'confetti'));
jest.mock('../streak/badge-image', () => ({
  BadgeImage: ({ label }: { label: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, `badge:${label}`),
}));

import type { NewAchievement } from '@finby/shared';
import { AchievementUnlockedModal } from './achievement-unlocked-modal';

const ACH: NewAchievement = { slug: 'streak-bronze', tier: 'BRONZE', label: 'Week Warrior', unlockedAt: '2026-07-01T00:00:00Z' };

beforeEach(() => celebrateHaptic.mockReset());

describe('AchievementUnlockedModal', () => {
  it('celebrates: confetti, headline, badge, tier, label, and a haptic on appear', async () => {
    await render(<AchievementUnlockedModal workspaceId="w1" achievement={ACH} remaining={1} onContinue={jest.fn()} />);
    expect(screen.getByText('Achievement unlocked! 🎉')).toBeTruthy();
    expect(screen.getByText('badge:Week Warrior')).toBeTruthy();
    expect(screen.getByText('Bronze')).toBeTruthy();
    expect(screen.getByText('Week Warrior')).toBeTruthy();
    expect(screen.getByText('confetti')).toBeTruthy();
    expect(celebrateHaptic).toHaveBeenCalledTimes(1);
  });

  it('Continue calls onContinue', async () => {
    const onContinue = jest.fn();
    await render(<AchievementUnlockedModal workspaceId="w1" achievement={ACH} remaining={1} onContinue={onContinue} />);
    await fireEvent.press(screen.getByText('Continue'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('shows the remaining count on Continue when more are queued', async () => {
    await render(<AchievementUnlockedModal workspaceId="w1" achievement={ACH} remaining={3} onContinue={jest.fn()} />);
    expect(screen.getByText('Next (2 more)')).toBeTruthy();
  });

  it('Share shares the brag text', async () => {
    const spy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    await render(<AchievementUnlockedModal workspaceId="w1" achievement={ACH} remaining={1} onContinue={jest.fn()} />);
    await fireEvent.press(screen.getByText('Share'));
    expect(spy).toHaveBeenCalledWith({ message: 'I just unlocked "Week Warrior" on Finby!' });
    spy.mockRestore();
  });

  it('renders nothing when there is no achievement', async () => {
    await render(<AchievementUnlockedModal workspaceId="w1" achievement={null} remaining={0} onContinue={jest.fn()} />);
    expect(screen.queryByText('Achievement unlocked! 🎉')).toBeNull();
    expect(celebrateHaptic).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/chat/achievement-unlocked-modal.test.tsx`
Expected: FAIL — cannot find module `./achievement-unlocked-modal`.

- [ ] **Step 4: Write the modal**

```tsx
// apps/mobile/src/components/chat/achievement-unlocked-modal.tsx
import { useEffect } from 'react';
import { Modal, Share, Text, View } from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import type { NewAchievement } from '@finby/shared';
import { BadgeImage } from '../streak/badge-image';
import { TierChip } from '../streak/tier-chip';
import { Button } from '../ui/button';
import { celebrateHaptic } from '../../lib/haptics';

/** Full-screen celebration shown when a chat-logged transaction unlocks an
 *  achievement: confetti + a success haptic over a centered badge card.
 *  Open while `achievement` is non-null; `remaining` is the queue length. */
export function AchievementUnlockedModal({
  workspaceId,
  achievement,
  remaining,
  onContinue,
}: {
  workspaceId: string;
  achievement: NewAchievement | null;
  remaining: number;
  onContinue: () => void;
}) {
  const slug = achievement?.slug;
  // Replays the haptic for each achievement in the queue (slug changes).
  useEffect(() => {
    if (slug) celebrateHaptic();
  }, [slug]);

  function onShare() {
    if (!achievement) return;
    void Share.share({ message: `I just unlocked "${achievement.label}" on Finby!` }).catch(() => {});
  }

  return (
    <Modal visible={!!achievement} transparent animationType="fade" onRequestClose={onContinue}>
      {achievement ? (
        <View className="flex-1 items-center justify-center bg-black/70 px-8">
          <View className="w-full max-w-sm items-center gap-4 rounded-3xl border border-line bg-surface p-6">
            <Text className="text-sm font-semibold uppercase tracking-wide text-accent">Achievement unlocked! 🎉</Text>
            <BadgeImage workspaceId={workspaceId} slug={achievement.slug} label={achievement.label} locked={false} size={120} />
            <TierChip tier={achievement.tier} />
            <Text className="text-center text-xl font-bold text-ink">{achievement.label}</Text>
            <View className="w-full gap-2">
              <Button onPress={onContinue}>{remaining > 1 ? `Next (${remaining - 1} more)` : 'Continue'}</Button>
              <Button variant="ghost" onPress={onShare}>
                Share
              </Button>
            </View>
          </View>
          <ConfettiCannon count={150} origin={{ x: -10, y: 0 }} autoStart fadeOut />
        </View>
      ) : null}
    </Modal>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/components/chat/achievement-unlocked-modal.test.tsx`
Expected: PASS (5 tests), pristine.

- [ ] **Step 6: Lint + commit**

```bash
cd apps/mobile && npx eslint src/lib/haptics.ts src/components/chat/achievement-unlocked-modal.tsx src/components/chat/achievement-unlocked-modal.test.tsx
cd /home/unicorn/Documents/finby
git add apps/mobile/src/lib/haptics.ts apps/mobile/src/components/chat/achievement-unlocked-modal.tsx apps/mobile/src/components/chat/achievement-unlocked-modal.test.tsx
git commit -m "feat(mobile): achievement unlock celebration modal (confetti, haptic, share)"
```

---

### Task 4: Wire the celebration into the chat screen

Collect `newAchievements` during a send, queue them after the stream, and render the modal.

**Files:**
- Modify: `apps/mobile/src/screens/chat-screen.tsx`
- Modify: `apps/mobile/src/screens/chat-screen.test.tsx`

**Interfaces:**
- Consumes: `AchievementUnlockedModal` (`../components/chat/achievement-unlocked-modal`), `NewAchievement` (`@finby/shared`).

- [ ] **Step 1: Add the failing test** to `chat-screen.test.tsx`.

Add these mocks alongside the existing ones (top of file):

```tsx
jest.mock('react-native-confetti-cannon', () => () => null);
jest.mock('../lib/haptics', () => ({ celebrateHaptic: jest.fn() }));
jest.mock('react-native-svg', () => ({ SvgXml: () => null }));
```

Extend the existing `jest.mock('../lib/runtime.native', …)` `gamification` object to include `getBadgeSvg` (the modal's BadgeImage fetches it):

```tsx
    gamification: {
      getXpSummary: jest.fn(async () => ({ balance: 40, totalEarned: 1250, todayEarned: 10 })),
      getBadgeSvg: jest.fn(async () => '<svg/>'),
    },
```

Add a test inside `describe('ChatScreen', …)`:

```tsx
  it('celebrates when a logged transaction unlocks an achievement', async () => {
    mockChat.streamMessage.mockImplementation(async (_ws, _c, _content, handlers) => {
      handlers.onAction({
        type: 'TRANSACTION_CREATED',
        transactionId: 't1',
        txType: 'EXPENSE',
        preview: { amount: '12.00', currency: 'USD', merchant: 'Cafe', category: 'Food' },
        currentStreak: 7,
        newAchievements: [{ slug: 'streak-bronze', tier: 'BRONZE', label: 'Week Warrior', unlockedAt: '2026-07-01T00:00:00Z' }],
      });
      handlers.onDone({ id: 'm1', role: 'ASSISTANT', content: 'Logged.', createdAt: '2026-07-01T00:00:00Z' });
    });

    await render(<ChatScreen />);
    await waitFor(() => expect(mockChat.listMessages).toHaveBeenCalled());
    await fireEvent.changeText(screen.getByTestId('composer-input'), 'spent 12 on lunch');
    await fireEvent.press(screen.getByTestId('composer-send'));

    await waitFor(() => expect(screen.getByText('Achievement unlocked! 🎉')).toBeTruthy());
    expect(screen.getByText('Week Warrior')).toBeTruthy();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/screens/chat-screen.test.tsx`
Expected: FAIL — no "Achievement unlocked! 🎉" (chat doesn't surface unlocks yet).

- [ ] **Step 3: Wire the screen** — in `chat-screen.tsx`:

Add `NewAchievement` to the `@finby/shared` type import:

```tsx
import type { ChatAction, ChatMessageView, NewAchievement, PendingConfirmation } from '@finby/shared';
```

Add the import (near the other component imports):

```tsx
import { AchievementUnlockedModal } from '../components/chat/achievement-unlocked-modal';
```

Add the queue state next to the other `useState`s:

```tsx
  const [celebration, setCelebration] = useState<NewAchievement[]>([]);
```

In `send()`, collect unlocks. Add a local before the `try` (after `let finalMessage…`):

```tsx
    const unlocked: NewAchievement[] = [];
```

In the `onAction` handler, capture any unlocks (replace the existing `onAction` line):

```tsx
        onAction: (a) => {
          if (a.type === 'TRANSACTION_CREATED' && a.newAchievements?.length) unlocked.push(...a.newAchievements);
          patch((msg) => ({ ...msg, actions: [...(msg.actions ?? []), a] }));
        },
```

After the stream resolves — add right after the `if (fm) patch(...)` line (inside the `try`, post-stream):

```tsx
      if (unlocked.length) setCelebration((c) => [...c, ...unlocked]);
```

Render the modal — add after the `<StreakSheet … />` block, before `</SafeAreaView>`:

```tsx
      {workspace ? (
        <AchievementUnlockedModal
          workspaceId={workspace.id}
          achievement={celebration[0] ?? null}
          remaining={celebration.length}
          onContinue={() => setCelebration((c) => c.slice(1))}
        />
      ) : null}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/screens/chat-screen.test.tsx`
Expected: PASS (existing + 1 new), pristine.

- [ ] **Step 5: Lint + commit**

```bash
cd apps/mobile && npx eslint src/screens/chat-screen.tsx src/screens/chat-screen.test.tsx
cd /home/unicorn/Documents/finby
git add apps/mobile/src/screens/chat-screen.tsx apps/mobile/src/screens/chat-screen.test.tsx
git commit -m "feat(mobile): celebrate achievement unlocks from chat"
```

---

### Task 5: Full gate + device validation

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

Run: `pnpm --filter finby-mobile start` → in chat, log a transaction that crosses an achievement threshold (e.g. a 7th-day streak, or the 10th transaction). Verify: after the reply finishes, the celebration modal appears with confetti, a haptic buzz, the badge, the tier chip, and the label; Continue dismisses (advancing if several unlocked at once); Share opens the native sheet with the brag text.

- [ ] **Step 3: No commit** (verification). Fix any issue under the relevant task and re-run the gate.

---

## Out of scope

A generated achievement share-*image* (text share only); sound; surfacing unlocks earned outside chat; a persistent new-achievements store.
