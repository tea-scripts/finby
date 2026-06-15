# Streak Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub-contributions-style calendar showing which local days the user logged a transaction (active), repaired, or missed — derived on read from transaction history, no schema change.

**Architecture:** A new `GET /workspaces/:workspaceId/streaks/calendar` endpoint buckets the user's `Transaction.createdAt` values into local days (same `localDayInfo` helper the streak uses, so calendar and streak count always agree) over a ~6-month window, returning `{ from, to, activeDays, repairedDays }`. The web renders a `StreakCalendar` heatmap from that payload via a pure grid-builder, shown in Settings and from the header streak badge.

**Tech Stack:** NestJS + Prisma (API, Jest tests), Next.js + React + Tailwind (web, Vitest + Testing Library).

**Part of:** `docs/superpowers/specs/2026-06-15-day0-retention-and-streak-calendar-design.md` (Part C). Independent of Parts A/B.

---

### Task 1: Pure local-day bucketing helper (API)

**Files:**
- Create: `apps/api/src/modules/streaks/streaks.calendar.ts`
- Test: `apps/api/src/modules/streaks/streaks.calendar.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/modules/streaks/streaks.calendar.spec.ts
import { bucketLocalDays } from './streaks.calendar';

describe('bucketLocalDays', () => {
  it('returns unique local-day dates, sorted ascending', () => {
    const dates = [
      new Date('2026-06-10T08:00:00Z'),
      new Date('2026-06-10T20:00:00Z'), // same UTC day -> deduped
      new Date('2026-06-12T00:30:00Z'),
    ];
    expect(bucketLocalDays(dates, 'UTC')).toEqual(['2026-06-10', '2026-06-12']);
  });

  it('uses the given timezone for the day boundary', () => {
    // 2026-06-10T23:30Z is 2026-06-11 in Asia/Kolkata (+05:30).
    expect(bucketLocalDays([new Date('2026-06-10T23:30:00Z')], 'Asia/Kolkata')).toEqual([
      '2026-06-11',
    ]);
  });

  it('falls back to UTC for an invalid timezone instead of throwing', () => {
    expect(bucketLocalDays([new Date('2026-06-10T08:00:00Z')], 'Not/AZone')).toEqual([
      '2026-06-10',
    ]);
  });

  it('returns an empty array for no dates', () => {
    expect(bucketLocalDays([], 'UTC')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/modules/streaks/streaks.calendar.spec.ts`
Expected: FAIL — `Cannot find module './streaks.calendar'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/api/src/modules/streaks/streaks.calendar.ts
import { localDayInfo } from '../reminders/reminders.time';

/** Unique local-day dates (YYYY-MM-DD) for the given instants, resolved in the
 *  user's timezone — matching how the streak credits a day (createdAt-aligned).
 *  Invalid timezone falls back to UTC. Sorted ascending. */
export function bucketLocalDays(dates: Date[], timezone: string): string[] {
  const set = new Set<string>();
  for (const d of dates) {
    try {
      set.add(localDayInfo(d, timezone).date);
    } catch {
      set.add(localDayInfo(d, 'UTC').date);
    }
  }
  return [...set].sort();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/modules/streaks/streaks.calendar.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/streaks/streaks.calendar.ts apps/api/src/modules/streaks/streaks.calendar.spec.ts
git commit -m "feat(streaks): pure local-day bucketing helper for the calendar"
```

---

### Task 2: `StreakCalendarView` type + `getCalendar` service method (API)

**Files:**
- Modify: `apps/api/src/modules/streaks/streaks.types.ts`
- Modify: `apps/api/src/modules/streaks/streaks.service.ts`
- Test: `apps/api/src/modules/streaks/streaks.service.calendar.spec.ts` (create)

> Why a new spec file: the existing `streaks.service.spec.ts` does `jest.mock('../reminders/reminders.time')`, which would also replace the `localDayInfo` used inside `bucketLocalDays`/`getCalendar` and collapse every date to one day. `getCalendar` needs the **real** time helpers, so its tests live in a separate file with no such mock.

- [ ] **Step 1: Add the view type**

Append to `apps/api/src/modules/streaks/streaks.types.ts`:

```typescript
/** Calendar of streak activity over a window, derived from transaction history. */
export interface StreakCalendarView {
  /** Inclusive window start, local YYYY-MM-DD. */
  from: string;
  /** Inclusive window end (the user's local today), YYYY-MM-DD. */
  to: string;
  /** Local days with >=1 logged transaction. */
  activeDays: string[];
  /** Local days credited by a streak repair (latest repair if in window). */
  repairedDays: string[];
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/api/src/modules/streaks/streaks.service.calendar.spec.ts` (NO time mock — uses the real `localDayInfo`):

```typescript
import type { PrismaService } from '../../prisma/prisma.service';
import { StreaksService } from './streaks.service';

// Fixed "now" passed in so the window is deterministic without mocking time.
const NOON_UTC = new Date('2026-06-15T12:00:00Z');

function setupCalendar(opts: {
  timezone?: string;
  lastStreakRepairDate?: string | null;
  txnCreatedAt?: Date[];
}) {
  const findUnique = jest.fn().mockResolvedValue({
    timezone: opts.timezone ?? 'UTC',
    lastStreakRepairDate: opts.lastStreakRepairDate ?? null,
  });
  const txnFindMany = jest
    .fn()
    .mockResolvedValue((opts.txnCreatedAt ?? []).map((createdAt) => ({ createdAt })));
  const prisma = {
    user: { findUnique },
    transaction: { findMany: txnFindMany },
  } as unknown as PrismaService;
  return { service: new StreaksService(prisma), txnFindMany };
}

describe('StreaksService.getCalendar', () => {
  it('returns active days bucketed from transaction createdAt within the window', async () => {
    const { service } = setupCalendar({
      txnCreatedAt: [new Date('2026-06-10T09:00:00Z'), new Date('2026-06-14T09:00:00Z')],
    });

    const cal = await service.getCalendar('u1', NOON_UTC);

    expect(cal.to).toBe('2026-06-15');
    expect(cal.activeDays).toEqual(['2026-06-10', '2026-06-14']);
    expect(cal.repairedDays).toEqual([]);
  });

  it('includes the latest repair when it falls inside the window', async () => {
    const { service } = setupCalendar({ lastStreakRepairDate: '2026-06-13' });

    const cal = await service.getCalendar('u1', NOON_UTC);

    expect(cal.repairedDays).toEqual(['2026-06-13']);
  });

  it('excludes a repair that predates the ~6-month window', async () => {
    const { service } = setupCalendar({ lastStreakRepairDate: '2024-01-01' });

    const cal = await service.getCalendar('u1', NOON_UTC);

    expect(cal.repairedDays).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/api && npx jest src/modules/streaks/streaks.service.calendar.spec.ts`
Expected: FAIL — `service.getCalendar is not a function`.

- [ ] **Step 4: Implement `getCalendar`**

In `apps/api/src/modules/streaks/streaks.service.ts`:

Add imports at the top (alongside the existing `localDayInfo, previousLocalDate` import and types import):

```typescript
import { localDayInfo, previousLocalDate } from '../reminders/reminders.time';
import { bucketLocalDays } from './streaks.calendar';
import { STREAK_ERRORS, type StreakStatusView, type StreakCalendarView } from './streaks.types';
```

Add these constants just below the class-opening `export class StreaksService {` line's preceding imports area (module scope, above the class):

```typescript
const DAY_MS = 24 * 60 * 60 * 1000;
/** ~6 months of history shown in the calendar. */
const CALENDAR_WINDOW_DAYS = 183;
```

Add this private helper inside the class (next to `localToday`):

```typescript
/** Full local-day info with the same UTC fallback as localToday. */
private dayInfo(now: Date, timezone: string | null): ReturnType<typeof localDayInfo> {
  try {
    return localDayInfo(now, timezone || 'UTC');
  } catch {
    return localDayInfo(now, 'UTC');
  }
}
```

Add the public method inside the class:

```typescript
/** Derive the streak calendar from transaction history over the last
 *  CALENDAR_WINDOW_DAYS. Active days are bucketed in the user's timezone so
 *  they line up with the streak count exactly. `now` is injectable for tests. */
async getCalendar(userId: string, now = new Date()): Promise<StreakCalendarView> {
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true, lastStreakRepairDate: true },
  });
  const tz = user?.timezone || 'UTC';

  const todayInfo = this.dayInfo(now, tz);
  const fromMs = todayInfo.startOfDayMs - (CALENDAR_WINDOW_DAYS - 1) * DAY_MS;
  const from = this.dayInfo(new Date(fromMs), tz).date;
  const to = todayInfo.date;

  const txns = await this.prisma.transaction.findMany({
    where: { loggedByUserId: userId, createdAt: { gte: new Date(fromMs) } },
    select: { createdAt: true },
  });
  const activeDays = bucketLocalDays(
    txns.map((t) => t.createdAt),
    tz,
  ).filter((d) => d >= from && d <= to);

  const repair = user?.lastStreakRepairDate ?? null;
  const repairedDays = repair && repair >= from && repair <= to ? [repair] : [];

  return { from, to, activeDays, repairedDays };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && npx jest src/modules/streaks/streaks.service.calendar.spec.ts && npx jest src/modules/streaks/streaks.service.spec.ts`
Expected: PASS (3 new calendar tests + the existing streak tests still green).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/streaks/streaks.types.ts apps/api/src/modules/streaks/streaks.service.ts apps/api/src/modules/streaks/streaks.service.calendar.spec.ts
git commit -m "feat(streaks): getCalendar deriving active/repaired days from history"
```

---

### Task 3: Calendar endpoint (API)

**Files:**
- Modify: `apps/api/src/modules/streaks/streaks.controller.ts`
- Test: `apps/api/src/modules/streaks/streaks.controller.spec.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/modules/streaks/streaks.controller.spec.ts` a case asserting the controller delegates. Match the existing spec's construction style; add inside the existing `describe('StreaksController', ...)`:

```typescript
it('GET calendar delegates to the service for the current user', async () => {
  const calendar = { from: '2025-12-15', to: '2026-06-15', activeDays: [], repairedDays: [] };
  const streaks = { getCalendar: jest.fn().mockResolvedValue(calendar) };
  const controller = new StreaksController(streaks as unknown as StreaksService);

  await expect(
    controller.getCalendar({ userId: 'u1' } as unknown as AuthUser),
  ).resolves.toBe(calendar);
  expect(streaks.getCalendar).toHaveBeenCalledWith('u1');
});
```

If `StreaksService`/`AuthUser` aren't already imported in this spec, add:
```typescript
import { StreaksService } from './streaks.service';
import type { AuthUser } from '../auth/auth.types';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/modules/streaks/streaks.controller.spec.ts -t calendar`
Expected: FAIL — `controller.getCalendar is not a function`.

- [ ] **Step 3: Add the endpoint**

In `apps/api/src/modules/streaks/streaks.controller.ts` update the type import and add the handler:

```typescript
import type { StreakStatusView, StreakCalendarView } from './streaks.types';
```

Add inside the controller class (after `getStatus`):

```typescript
/** Activity calendar (last ~6 months) for the requesting member. Not tier-gated. */
@Get('calendar')
getCalendar(@CurrentUser() user: AuthUser): Promise<StreakCalendarView> {
  return this.streaks.getCalendar(user.userId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/modules/streaks/streaks.controller.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/streaks/streaks.controller.ts apps/api/src/modules/streaks/streaks.controller.spec.ts
git commit -m "feat(streaks): GET calendar endpoint"
```

---

### Task 4: Web type + API client (web)

**Files:**
- Modify: `apps/web/src/lib/types.ts`
- Modify: `apps/web/src/lib/streaks-api.ts`

- [ ] **Step 1: Add the type**

Append to `apps/web/src/lib/types.ts` after the `StreakStatus` interface:

```typescript
export interface StreakCalendar {
  from: string;
  to: string;
  activeDays: string[];
  repairedDays: string[];
}
```

- [ ] **Step 2: Add the client call**

In `apps/web/src/lib/streaks-api.ts` update the type import and add the function:

```typescript
import type { StreakStatus, StreakCalendar } from './types';
```

```typescript
export function getStreakCalendar(workspaceId: string): Promise<StreakCalendar> {
  return authed<StreakCalendar>(`/workspaces/${workspaceId}/streaks/calendar`);
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/types.ts apps/web/src/lib/streaks-api.ts
git commit -m "feat(web): streak calendar type + api client"
```

---

### Task 5: Pure calendar grid builder (web)

**Files:**
- Create: `apps/web/src/lib/streak-calendar.ts`
- Test: `apps/web/src/lib/streak-calendar.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/src/lib/streak-calendar.test.ts
import { describe, it, expect } from 'vitest';
import { buildCalendarCells } from './streak-calendar';

describe('buildCalendarCells', () => {
  it('emits one cell per day from..to inclusive', () => {
    const cells = buildCalendarCells('2026-06-10', '2026-06-12', [], []);
    expect(cells.map((c) => c.date)).toEqual(['2026-06-10', '2026-06-11', '2026-06-12']);
  });

  it('marks active, repaired, and missed states (repaired wins over active)', () => {
    const cells = buildCalendarCells(
      '2026-06-10',
      '2026-06-12',
      ['2026-06-10', '2026-06-11'],
      ['2026-06-11'],
    );
    expect(cells.map((c) => c.state)).toEqual(['active', 'repaired', 'missed']);
  });

  it('tags each cell with its UTC weekday (0=Sun..6=Sat)', () => {
    // 2026-06-10 is a Wednesday (weekday 3).
    expect(buildCalendarCells('2026-06-10', '2026-06-10', [], [])[0].weekday).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/streak-calendar.test.ts`
Expected: FAIL — cannot import `buildCalendarCells`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/web/src/lib/streak-calendar.ts
export type DayState = 'active' | 'repaired' | 'missed';

export interface CalendarCell {
  /** YYYY-MM-DD */
  date: string;
  state: DayState;
  /** 0=Sun .. 6=Sat, for grid row placement. */
  weekday: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Flat list of cells for every day in [from, to] inclusive. Repaired beats
 *  active beats missed. Pure UTC calendar math on the date strings (which are
 *  timezone-agnostic), so no DST concerns. */
export function buildCalendarCells(
  from: string,
  to: string,
  activeDays: string[],
  repairedDays: string[],
): CalendarCell[] {
  const active = new Set(activeDays);
  const repaired = new Set(repairedDays);
  const cells: CalendarCell[] = [];

  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  let cur = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);

  while (cur <= end) {
    const d = new Date(cur);
    const date = d.toISOString().slice(0, 10);
    const state: DayState = repaired.has(date) ? 'repaired' : active.has(date) ? 'active' : 'missed';
    cells.push({ date, state, weekday: d.getUTCDay() });
    cur += DAY_MS;
  }
  return cells;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/lib/streak-calendar.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/streak-calendar.ts apps/web/src/lib/streak-calendar.test.ts
git commit -m "feat(web): pure streak-calendar grid builder"
```

---

### Task 6: `StreakCalendar` component (web)

**Files:**
- Create: `apps/web/src/components/streak/StreakCalendar.tsx`
- Test: `apps/web/src/components/streak/StreakCalendar.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/src/components/streak/StreakCalendar.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { StreakCalendar } from './StreakCalendar';

vi.mock('../../lib/streaks-api', () => ({ getStreakCalendar: vi.fn() }));

const state = { workspace: { id: 'w1' } };
vi.mock('../../lib/store', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useAuth: vi.fn((selector: any) => selector(state)),
}));

import { getStreakCalendar } from '../../lib/streaks-api';
const mockGet = vi.mocked(getStreakCalendar);

beforeEach(() => vi.clearAllMocks());

describe('StreakCalendar', () => {
  it('fetches and renders an active-day cell with an accessible label', async () => {
    mockGet.mockResolvedValue({
      from: '2026-06-09',
      to: '2026-06-10',
      activeDays: ['2026-06-10'],
      repairedDays: [],
    });

    render(<StreakCalendar />);

    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('w1'));
    expect(await screen.findByLabelText('2026-06-10: logged')).toBeInTheDocument();
    expect(screen.getByLabelText('2026-06-09: missed')).toBeInTheDocument();
  });

  it('shows an empty state when there is no history', async () => {
    mockGet.mockResolvedValue({ from: '2026-06-10', to: '2026-06-10', activeDays: [], repairedDays: [] });
    render(<StreakCalendar />);
    expect(await screen.findByLabelText('2026-06-10: missed')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/streak/StreakCalendar.test.tsx`
Expected: FAIL — cannot import `StreakCalendar`.

- [ ] **Step 3: Write the component**

```tsx
// apps/web/src/components/streak/StreakCalendar.tsx
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/store';
import { getStreakCalendar } from '@/lib/streaks-api';
import { buildCalendarCells, type CalendarCell, type DayState } from '@/lib/streak-calendar';

const STATE_CLASS: Record<DayState, string> = {
  active: 'bg-accent',
  repaired: 'bg-accent/50 ring-1 ring-accent',
  missed: 'bg-line/60',
};

const STATE_LABEL: Record<DayState, string> = {
  active: 'logged',
  repaired: 'repaired',
  missed: 'missed',
};

/** Activity heatmap for the user's streak. Self-fetches the last ~6 months and
 *  renders a 7-row (weekday) grid that flows by column (week). The first cell
 *  is offset to its weekday so columns line up like a wall calendar. */
export function StreakCalendar() {
  const workspaceId = useAuth((s) => s.workspace?.id);
  const [cells, setCells] = useState<CalendarCell[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    getStreakCalendar(workspaceId)
      .then((cal) => {
        if (cancelled) return;
        setCells(buildCalendarCells(cal.from, cal.to, cal.activeDays, cal.repairedDays));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  if (failed) return <p className="text-xs text-muted">Couldn&apos;t load your calendar.</p>;
  if (!cells) return <p className="text-xs text-faint">Loading…</p>;

  return (
    <div className="space-y-3">
      <div
        className="grid grid-flow-col gap-1"
        style={{ gridTemplateRows: 'repeat(7, minmax(0, 1fr))' }}
        role="grid"
        aria-label="Streak activity calendar"
      >
        {cells.map((cell, i) => (
          <span
            key={cell.date}
            aria-label={`${cell.date}: ${STATE_LABEL[cell.state]}`}
            className={`h-3 w-3 rounded-sm ${STATE_CLASS[cell.state]}`}
            // Offset only the first cell to its weekday row; the rest flow.
            style={i === 0 ? { gridRowStart: cell.weekday + 1 } : undefined}
          />
        ))}
      </div>

      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-accent" /> Logged
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-accent/50 ring-1 ring-accent" /> Repaired
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-line/60" /> Missed
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/components/streak/StreakCalendar.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/streak/StreakCalendar.tsx apps/web/src/components/streak/StreakCalendar.test.tsx
git commit -m "feat(web): StreakCalendar heatmap component"
```

---

### Task 7: Place the calendar in Settings (web)

**Files:**
- Modify: `apps/web/src/components/settings/preferences-section.tsx`
- Test: `apps/web/src/components/settings/preferences-section.test.tsx` (append)

- [ ] **Step 1: Write the failing test**

Append a case to the existing describe in `preferences-section.test.tsx`. The existing file already mocks the store and `settings-api`; add a mock for the calendar component so this test stays focused:

```typescript
vi.mock('../streak/StreakCalendar', () => ({
  StreakCalendar: () => <div data-testid="streak-calendar" />,
}));

it('renders the streak calendar in the streak block', () => {
  render(<PreferencesSection />);
  expect(screen.getByTestId('streak-calendar')).toBeInTheDocument();
});
```

(Place the `vi.mock` near the other `vi.mock` calls at the top of the file, and the `it(...)` inside the existing `describe`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/settings/preferences-section.test.tsx -t "streak calendar"`
Expected: FAIL — testid not found.

- [ ] **Step 3: Render the calendar**

In `apps/web/src/components/settings/preferences-section.tsx`:

Add the import near the other component imports:
```typescript
import { StreakCalendar } from '@/components/streak/StreakCalendar';
```

In the streak block at the bottom (the `<div className="border-t border-line pt-4">` that shows current/best streak), add the calendar below the "Best" line, before the closing `</div>`:

```tsx
<div className="mt-4">
  <StreakCalendar />
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/components/settings/preferences-section.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/settings/preferences-section.tsx apps/web/src/components/settings/preferences-section.test.tsx
git commit -m "feat(web): show streak calendar in settings"
```

---

### Task 8: Open the calendar from the header streak badge (web)

**Files:**
- Modify: `apps/web/src/components/streak/StreakRepair.tsx`
- Test: `apps/web/src/components/streak/StreakRepair.test.tsx` (append)

- [ ] **Step 1: Write the failing test**

Append to `StreakRepair.test.tsx`. The file already mocks the store and `streaks-api`; add a mock for `StreakCalendar` and a case. The safe-streak tap currently opens the celebration tooltip — we add a "View calendar" button inside it that opens a modal:

```typescript
vi.mock('./StreakCalendar', () => ({ StreakCalendar: () => <div data-testid="streak-calendar" /> }));

it('safe streak: opening the tooltip exposes a View calendar action that shows the calendar', async () => {
  mockGet.mockResolvedValue({
    currentStreak: 12, longestStreak: 12, atRisk: false, repairEligible: false, repairUsedThisMonth: false,
  });

  render(<StreakRepair />);

  const badge = await screen.findByRole('button', { name: /streak/i });
  fireEvent.click(badge); // opens celebration tooltip
  fireEvent.click(await screen.findByRole('button', { name: /view calendar/i }));

  expect(await screen.findByTestId('streak-calendar')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/streak/StreakRepair.test.tsx -t "View calendar"`
Expected: FAIL — no "View calendar" button.

- [ ] **Step 3: Add the calendar modal**

In `apps/web/src/components/streak/StreakRepair.tsx`:

Add imports:
```typescript
import { StreakCalendar } from '@/components/streak/StreakCalendar';
```

Add state near the other `useState` hooks:
```typescript
const [calendarOpen, setCalendarOpen] = useState(false);
```

Inside the celebration tooltip block (the `role="status"` div), add a button under `{celebration}`:
```tsx
<button
  type="button"
  onClick={() => {
    setCelebrateOpen(false);
    setCalendarOpen(true);
  }}
  className="mt-2 text-xs font-medium text-accent hover:underline"
>
  View calendar →
</button>
```

Add a Modal near the other modals (before the closing fragment `</>`):
```tsx
<Modal open={calendarOpen} onClose={() => setCalendarOpen(false)} title="Your streak">
  <StreakCalendar />
</Modal>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/components/streak/StreakRepair.test.tsx`
Expected: PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/streak/StreakRepair.tsx apps/web/src/components/streak/StreakRepair.test.tsx
git commit -m "feat(web): open streak calendar from the header badge"
```

---

### Task 9: Full verification

- [ ] **Step 1: API tests + lint**

Run: `cd apps/api && npm run test && npm run lint`
Expected: PASS.

- [ ] **Step 2: Web tests + lint + build**

Run: `cd apps/web && npm run test && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 3: Manual smoke (optional)**

Start the app, log a couple of transactions across different days (or seed data), open Settings → streak block and the header badge → the calendar should paint logged days in accent and match the streak number.
