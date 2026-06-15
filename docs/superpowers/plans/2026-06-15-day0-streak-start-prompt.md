# Day-0 Streak-Start Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Right after a user logs their first transaction (streak becomes 1), show a one-time prompt to turn on reminders — push opt-in on push-capable browsers, or the existing Add-to-Home-Screen sheet on iOS Safari — converting the moment of value into a return channel.

**Architecture:** A pure gate (`shouldPromptStreakStart`) decides eligibility from `(streak, pushState, alreadyShown)`. A presentational `StreakStartPrompt` component renders the push or iOS variant (reusing `lib/push.ts` and the existing `InstallSheet`) and persists a "shown" flag in `localStorage`. The chat page wires the trigger off the streak update it already performs at `chat/page.tsx:151`.

**Tech Stack:** Next.js + React (web, Vitest + Testing Library). Reuses `lib/push.ts` (`enablePush`, `getPushState`, `isPushSupported`), `lib/ios.ts` (`detectIosSafariTab`), and `components/app/install-sheet.tsx`.

**Part of:** `docs/superpowers/specs/2026-06-15-day0-retention-and-streak-calendar-design.md` (Part B). Independent of Parts A/C.

---

### Task 1: Pure eligibility gate (web)

**Files:**
- Create: `apps/web/src/lib/streak-start.ts`
- Test: `apps/web/src/lib/streak-start.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/src/lib/streak-start.test.ts
import { describe, it, expect } from 'vitest';
import { shouldPromptStreakStart } from './streak-start';

describe('shouldPromptStreakStart', () => {
  it('prompts on the first streak day when push is off and not yet shown', () => {
    expect(shouldPromptStreakStart(1, 'off', false)).toBe(true);
  });

  it('does not prompt past day 1', () => {
    expect(shouldPromptStreakStart(2, 'off', false)).toBe(false);
  });

  it('does not prompt when already shown once', () => {
    expect(shouldPromptStreakStart(1, 'off', true)).toBe(false);
  });

  it('does not prompt when push is already on', () => {
    expect(shouldPromptStreakStart(1, 'on', false)).toBe(false);
  });

  it('still prompts when push was denied (iOS install path can help)', () => {
    expect(shouldPromptStreakStart(1, 'denied', false)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/streak-start.test.ts`
Expected: FAIL — cannot import `shouldPromptStreakStart`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/web/src/lib/streak-start.ts
import type { PushState } from './push';

export const STREAK_START_SHOWN_KEY = 'finby_streak_start_shown';

/** Show the day-0 reminder prompt only on the very first streak day, once ever,
 *  and only when the user isn't already subscribed to push. A 'denied' state
 *  still qualifies because the iOS install path is a separate route to reminders. */
export function shouldPromptStreakStart(
  streak: number,
  pushState: PushState,
  alreadyShown: boolean,
): boolean {
  if (alreadyShown) return false;
  if (streak !== 1) return false;
  return pushState !== 'on';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/lib/streak-start.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/streak-start.ts apps/web/src/lib/streak-start.test.ts
git commit -m "feat(web): pure gate for the day-0 streak-start prompt"
```

---

### Task 2: `StreakStartPrompt` component (web)

**Files:**
- Create: `apps/web/src/components/streak/StreakStartPrompt.tsx`
- Test: `apps/web/src/components/streak/StreakStartPrompt.test.tsx`

Behaviour: a controlled modal. On a push-capable browser it shows an "Enable reminders" button calling `enablePush`. On an iOS Safari tab it shows an "Install Finby" button opening the existing `InstallSheet`. Dismiss or enable persists the shown flag.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/src/components/streak/StreakStartPrompt.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StreakStartPrompt } from './StreakStartPrompt';
import { STREAK_START_SHOWN_KEY } from '../../lib/streak-start';

vi.mock('../../lib/push', () => ({ enablePush: vi.fn().mockResolvedValue('on') }));
vi.mock('../../lib/ios', () => ({ detectIosSafariTab: vi.fn() }));
// InstallSheet is exercised in its own tests; stub it here.
vi.mock('../app/install-sheet', () => ({
  InstallSheet: ({ open }: { open: boolean }) => (open ? <div data-testid="install-sheet" /> : null),
}));

const state = { workspace: { id: 'w1' } };
vi.mock('../../lib/store', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useAuth: vi.fn((selector: any) => selector(state)),
}));

import { enablePush } from '../../lib/push';
import { detectIosSafariTab } from '../../lib/ios';
const mockEnable = vi.mocked(enablePush);
const mockIsIos = vi.mocked(detectIosSafariTab);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockIsIos.mockReturnValue(false);
});

describe('StreakStartPrompt', () => {
  it('push browser: Enable reminders calls enablePush and marks shown', async () => {
    const onClose = vi.fn();
    render(<StreakStartPrompt open onClose={onClose} streak={1} />);

    fireEvent.click(screen.getByRole('button', { name: /enable reminders/i }));

    await waitFor(() => expect(mockEnable).toHaveBeenCalledWith('w1'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(localStorage.getItem(STREAK_START_SHOWN_KEY)).toBe('1');
  });

  it('iOS Safari tab: shows Install Finby which opens the install sheet', async () => {
    mockIsIos.mockReturnValue(true);
    render(<StreakStartPrompt open onClose={vi.fn()} streak={1} />);

    fireEvent.click(screen.getByRole('button', { name: /install finby/i }));

    expect(await screen.findByTestId('install-sheet')).toBeInTheDocument();
    expect(mockEnable).not.toHaveBeenCalled();
  });

  it('dismissing marks shown so it never reappears', () => {
    const onClose = vi.fn();
    render(<StreakStartPrompt open onClose={onClose} streak={1} />);

    fireEvent.click(screen.getByRole('button', { name: /not now/i }));

    expect(onClose).toHaveBeenCalled();
    expect(localStorage.getItem(STREAK_START_SHOWN_KEY)).toBe('1');
  });

  it('renders nothing when closed', () => {
    const { container } = render(<StreakStartPrompt open={false} onClose={vi.fn()} streak={1} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/streak/StreakStartPrompt.test.tsx`
Expected: FAIL — cannot import `StreakStartPrompt`.

- [ ] **Step 3: Write the component**

```tsx
// apps/web/src/components/streak/StreakStartPrompt.tsx
'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { InstallSheet } from '@/components/app/install-sheet';
import { enablePush } from '@/lib/push';
import { detectIosSafariTab } from '@/lib/ios';
import { useAuth } from '@/lib/store';
import { STREAK_START_SHOWN_KEY } from '@/lib/streak-start';

/** One-time "you started a streak — turn on reminders" prompt. Push-capable
 *  browsers get a one-tap enable; iOS Safari tabs (no programmatic push) get the
 *  guided Add-to-Home-Screen sheet instead. Visibility/eligibility is decided by
 *  the caller (see shouldPromptStreakStart); this component just renders + records
 *  that it was shown. */
export function StreakStartPrompt({
  open,
  onClose,
  streak,
}: {
  open: boolean;
  onClose: () => void;
  streak: number;
}) {
  const workspaceId = useAuth((s) => s.workspace?.id);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const isIos = detectIosSafariTab();

  function markShown() {
    try {
      localStorage.setItem(STREAK_START_SHOWN_KEY, '1');
    } catch {
      /* private mode / storage disabled — non-fatal */
    }
  }

  function dismiss() {
    markShown();
    onClose();
  }

  async function onEnable() {
    if (!workspaceId) return;
    setBusy(true);
    try {
      await enablePush(workspaceId);
    } finally {
      markShown();
      setBusy(false);
      onClose();
    }
  }

  if (!open) return null;

  return (
    <>
      <Modal open={open} onClose={dismiss} title="🔥 You started a streak!">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            That&apos;s day {streak}. Turn on reminders so a gentle nudge keeps your streak alive —
            it only takes a tap a day.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={dismiss}>
              Not now
            </Button>
            {isIos ? (
              <Button variant="primary" onClick={() => setSheetOpen(true)}>
                Install Finby
              </Button>
            ) : (
              <Button variant="primary" loading={busy} onClick={onEnable}>
                Enable reminders
              </Button>
            )}
          </div>
        </div>
      </Modal>

      <InstallSheet
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          dismiss();
        }}
      />
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/components/streak/StreakStartPrompt.test.tsx`
Expected: PASS (4 tests).

> If the `Button` component has no `loading` prop, drop it and use `disabled={busy}` instead — check `apps/web/src/components/ui/button.tsx` (the existing `StreakRepair` uses `loading`, so it should exist).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/streak/StreakStartPrompt.tsx apps/web/src/components/streak/StreakStartPrompt.test.tsx
git commit -m "feat(web): StreakStartPrompt for the day-0 reminder opt-in"
```

---

### Task 3: Trigger from the chat page (web)

**Files:**
- Modify: `apps/web/src/app/(app)/chat/page.tsx`

The chat page already advances the streak in the `onAction` handler at `chat/page.tsx:149-156`. We add: when the new streak is exactly 1, evaluate the gate and open the prompt.

- [ ] **Step 1: Add imports**

Near the other imports in `chat/page.tsx`:

```typescript
import { StreakStartPrompt } from '@/components/streak/StreakStartPrompt';
import { shouldPromptStreakStart, STREAK_START_SHOWN_KEY } from '@/lib/streak-start';
import { getPushState } from '@/lib/push';
```

- [ ] **Step 2: Add component state**

Near the other `useState` hooks in the component (e.g. alongside `setUser`):

```typescript
const [streakStartOpen, setStreakStartOpen] = useState(false);
```

- [ ] **Step 3: Evaluate the gate when the streak hits 1**

In the `onAction` handler, inside the existing `if (a.currentStreak != null) { setUser({...}) }` block, after the `setUser({...})` call, add:

```typescript
if (a.currentStreak === 1) {
  void (async () => {
    let shown = false;
    try {
      shown = localStorage.getItem(STREAK_START_SHOWN_KEY) === '1';
    } catch {
      /* storage disabled */
    }
    const pushState = await getPushState();
    if (shouldPromptStreakStart(1, pushState, shown)) setStreakStartOpen(true);
  })();
}
```

- [ ] **Step 4: Render the prompt**

In the component's returned JSX, add near the other top-level overlays/modals (e.g. beside any existing modal at the end of the returned tree):

```tsx
<StreakStartPrompt
  open={streakStartOpen}
  onClose={() => setStreakStartOpen(false)}
  streak={1}
/>
```

- [ ] **Step 5: Verify the build + existing chat tests**

Run: `cd apps/web && npx vitest run src/app && npm run build`
Expected: PASS (no chat-page test regressions; the page compiles).

> If `src/app` has no tests, the `vitest run src/app` step may report "no test files" — that's fine; the `npm run build` step is the real gate here.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(app)/chat/page.tsx"
git commit -m "feat(web): trigger the streak-start prompt on the first logged transaction"
```

---

### Task 4: Full verification

- [ ] **Step 1: Web tests + lint + build**

Run: `cd apps/web && npm run test && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 2: Manual smoke (optional)**

Sign in as a user with `currentStreak: 0`, log a first transaction in chat. On Chrome/Android the prompt should appear with "Enable reminders"; clicking it triggers the browser permission prompt. Reload and log again — the prompt must NOT reappear (shown flag set). On an iOS Safari tab the prompt shows "Install Finby" and opens the Add-to-Home-Screen sheet.
