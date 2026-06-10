# Daily Re-engagement Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send a once-daily Web Push nudge (delivered while the app is closed) to users who haven't logged a transaction that day, in their own local evening, with a per-user opt-out.

**Architecture:** A new NestJS `RemindersService` runs an hourly cron, selects users whose local time is ~8pm and who have push enabled + reminders on + nothing logged since their local midnight, and pushes a personalized message via a new user-level `PushService.sendToUserDevices`. The reminder preference and a per-day idempotency stamp live in the existing `User.preferences` JSON (no migration). A web settings toggle controls it.

**Tech Stack:** NestJS, `@nestjs/schedule`, Prisma, `web-push`, Zod; Next.js + React + Vitest (web); Jest (api); pnpm workspaces + Turbo. Shared types in `@finby/shared` (built to `dist`).

**Design ref:** `docs/superpowers/specs/2026-06-10-daily-reengagement-push-design.md`

**Deviation from spec:** Spec described nested `notifications.{dailyReminders,lastDailyReminderAt}`. We use **flat** preference keys `dailyReminders` and `lastDailyReminderAt` instead, because existing preferences are flat and `updateProfile` shallow-merges patches — a nested object would be clobbered by the shallow merge and silently dropped by `parsePreferences` (which strips unknown keys). Flat keys are added to the shared type + Zod schema so they survive `parsePreferences`.

**Commands reference:**
- Build shared: `pnpm --filter @finby/shared build`
- Run an api test file: `pnpm --filter finby-api exec jest <path>`
- Run a web test file: `pnpm --filter finby-web exec vitest run <path>`
- Typecheck all: `pnpm typecheck`

---

## File Structure

**Shared (`packages/shared/src/`)**
- Modify `types.ts` — add `dailyReminders` + `lastDailyReminderAt` to `UserPreferences`
- Modify `constants.ts` — add the two fields to `DEFAULT_PREFERENCES`

**API (`apps/api/src/`)**
- Modify `modules/auth/preferences.util.ts` — extend `preferencesSchema` with the two fields
- Modify `modules/push/push.service.ts` — extract private `deliver`; add `sendToUserDevices`
- Modify `modules/push/push.service.spec.ts` — add `sendToUserDevices` test
- Create `modules/reminders/reminders.time.ts` — `localDayInfo(now, tz)` timezone helper
- Create `modules/reminders/reminders.time.spec.ts`
- Create `modules/reminders/reminders.copy.ts` — `reminderCopy(name, dayIndex)` + `dayOfYearUtc(now)`
- Create `modules/reminders/reminders.copy.spec.ts`
- Create `modules/reminders/reminders.service.ts` — cron + selection/send logic
- Create `modules/reminders/reminders.service.spec.ts`
- Create `modules/reminders/reminders.module.ts`
- Modify `app.module.ts` — register `RemindersModule`

**Web (`apps/web/src/`)**
- Modify `components/chat/notif-toggle.tsx` — add optional `onStateChange` prop
- Modify `components/settings/preferences-section.tsx` — add a "Daily reminder" switch row
- Modify `components/settings/preferences-section.test.tsx` — tests for the switch

**Deploy-time (not a code task):** Set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` in the API env (`npx web-push generate-vapid-keys`). The whole feature no-ops until these are set.

---

## Task 1: Add reminder fields to shared preferences

**Files:**
- Modify: `packages/shared/src/types.ts:18-22`
- Modify: `packages/shared/src/constants.ts:140-144`

- [ ] **Step 1: Extend the `UserPreferences` interface**

In `packages/shared/src/types.ts`, replace the `UserPreferences` interface:

```ts
export interface UserPreferences {
  dateFormat: DateFormat;
  numberFormat: NumberFormat;
  currencyDisplay: CurrencyDisplay;
  /** Daily "did you log anything?" push nudge. Default on. */
  dailyReminders: boolean;
  /** Internal: local date (YYYY-MM-DD) the last daily reminder was sent, for
   *  idempotency. Set server-side; null until first send. */
  lastDailyReminderAt: string | null;
}
```

- [ ] **Step 2: Extend `DEFAULT_PREFERENCES`**

In `packages/shared/src/constants.ts`, replace the `DEFAULT_PREFERENCES` const:

```ts
export const DEFAULT_PREFERENCES: UserPreferences = {
  dateFormat: 'MEDIUM',
  numberFormat: 'GROUPED',
  currencyDisplay: 'SYMBOL',
  dailyReminders: true,
  lastDailyReminderAt: null,
};
```

- [ ] **Step 3: Build shared and typecheck**

Run: `pnpm --filter @finby/shared build && pnpm --filter @finby/shared typecheck`
Expected: both succeed (no type errors).

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/src/constants.ts
git commit -m "feat(shared): add dailyReminders preference fields"
```

---

## Task 2: Allow the new fields through the API preferences schema

`parsePreferences` strips any key not in `preferencesSchema`. Without this task the cron's `lastDailyReminderAt` stamp and the user's `dailyReminders` choice would be dropped on the next profile update.

**Files:**
- Modify: `apps/api/src/modules/auth/preferences.util.ts:6-12`
- Test: `apps/api/src/modules/auth/preferences.util.spec.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

Create/append `apps/api/src/modules/auth/preferences.util.spec.ts`:

```ts
import { parsePreferences } from './preferences.util';

describe('parsePreferences (reminder fields)', () => {
  it('preserves dailyReminders and lastDailyReminderAt', () => {
    const result = parsePreferences({ dailyReminders: false, lastDailyReminderAt: '2026-06-10' });
    expect(result.dailyReminders).toBe(false);
    expect(result.lastDailyReminderAt).toBe('2026-06-10');
  });

  it('defaults dailyReminders to true and lastDailyReminderAt to null', () => {
    const result = parsePreferences({});
    expect(result.dailyReminders).toBe(true);
    expect(result.lastDailyReminderAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter finby-api exec jest src/modules/auth/preferences.util.spec.ts`
Expected: FAIL — `dailyReminders` comes back `undefined` (stripped by the schema).

- [ ] **Step 3: Extend the schema**

In `apps/api/src/modules/auth/preferences.util.ts`, replace the `preferencesSchema` const:

```ts
export const preferencesSchema = z
  .object({
    dateFormat: z.enum(['MEDIUM', 'SHORT', 'ISO']),
    numberFormat: z.enum(['GROUPED', 'PLAIN']),
    currencyDisplay: z.enum(['SYMBOL', 'CODE']),
    dailyReminders: z.boolean(),
    lastDailyReminderAt: z.string().nullable(),
  })
  .partial();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter finby-api exec jest src/modules/auth/preferences.util.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/auth/preferences.util.ts apps/api/src/modules/auth/preferences.util.spec.ts
git commit -m "feat(api): allow reminder fields through preferences schema"
```

---

## Task 3: Add `PushService.sendToUserDevices`

Reaches every device a user has across all workspaces (existing `sendToUser` is workspace-scoped). Refactors the inline delivery loop into a shared private `deliver`.

**Files:**
- Modify: `apps/api/src/modules/push/push.service.ts:63-90`
- Test: `apps/api/src/modules/push/push.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/modules/push/push.service.spec.ts` (inside the `describe('PushService (configured)')` block):

```ts
  it('sendToUserDevices addresses every device for a user (no workspace filter)', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { endpoint: 'https://push.example/d1', p256dh: 'a', auth: 'b' },
      { endpoint: 'https://push.example/d2', p256dh: 'c', auth: 'd' },
    ]);
    const prisma = { pushSubscription: { findMany } };
    const service = new PushService(prisma as unknown as PrismaService, makeConfig(CONFIGURED));

    await service.sendToUserDevices('u1', { title: 'Finby', body: 'hi', url: '/chat' });

    expect(findMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it('sendToUserDevices no-ops when unconfigured', async () => {
    const findMany = jest.fn();
    const prisma = { pushSubscription: { findMany } };
    const service = new PushService(prisma as unknown as PrismaService, makeConfig({}));
    await service.sendToUserDevices('u1', { title: 'x', body: 'y' });
    expect(findMany).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter finby-api exec jest src/modules/push/push.service.spec.ts`
Expected: FAIL — `service.sendToUserDevices is not a function`.

- [ ] **Step 3: Refactor delivery and add the method**

In `apps/api/src/modules/push/push.service.ts`, replace the `sendToUser` method (lines 61-90) with the following three members:

```ts
  /** Fan a notification out to a member's devices in one workspace. */
  async sendToUser(workspaceId: string, userId: string, payload: PushPayload): Promise<void> {
    if (!this.configured) return;
    const subs = await this.prisma.pushSubscription.findMany({ where: { workspaceId, userId } });
    if (subs.length === 0) return;
    await this.deliver(subs, payload);
  }

  /** Fan a notification out to every device a user has, across all workspaces.
   *  Used for user-level notifications (e.g. the daily reminder). */
  async sendToUserDevices(userId: string, payload: PushPayload): Promise<void> {
    if (!this.configured) return;
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) return;
    await this.deliver(subs, payload);
  }

  /** Send to a set of subscriptions; prunes dead (404/410) endpoints. */
  private async deliver(
    subs: Array<{ endpoint: string; p256dh: string; auth: string }>,
    payload: PushPayload,
  ): Promise<void> {
    const body = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body,
          );
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await this.prisma.pushSubscription
              .delete({ where: { endpoint: sub.endpoint } })
              .catch(() => undefined);
          } else {
            this.logger.warn(`Push send failed (${statusCode ?? 'unknown'}).`);
          }
        }
      }),
    );
  }
```

- [ ] **Step 4: Run the full push spec to verify all pass**

Run: `pnpm --filter finby-api exec jest src/modules/push/push.service.spec.ts`
Expected: PASS — existing `sendToUser`/prune tests still green plus the two new ones.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/push/push.service.ts apps/api/src/modules/push/push.service.spec.ts
git commit -m "feat(api): add PushService.sendToUserDevices for user-level push"
```

---

## Task 4: Timezone helper `localDayInfo`

Pure function: given an instant and an IANA timezone, returns the local hour, local date string, and the UTC epoch ms of local midnight.

**Files:**
- Create: `apps/api/src/modules/reminders/reminders.time.ts`
- Test: `apps/api/src/modules/reminders/reminders.time.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/reminders/reminders.time.spec.ts`:

```ts
import { localDayInfo } from './reminders.time';

describe('localDayInfo', () => {
  const instant = new Date('2026-06-10T19:00:00Z'); // 19:00 UTC

  it('reports UTC hour/date unchanged for UTC', () => {
    const info = localDayInfo(instant, 'UTC');
    expect(info.hour).toBe(19);
    expect(info.date).toBe('2026-06-10');
    expect(info.startOfDayMs).toBe(Date.UTC(2026, 5, 10, 0, 0, 0));
  });

  it('rolls into the next local day for +5:30 (Asia/Kolkata)', () => {
    const info = localDayInfo(instant, 'Asia/Kolkata'); // 19:00Z -> 00:30 next day
    expect(info.hour).toBe(0);
    expect(info.date).toBe('2026-06-11');
    // local midnight 2026-06-11 00:00 +05:30 == 2026-06-10T18:30:00Z
    expect(info.startOfDayMs).toBe(Date.parse('2026-06-10T18:30:00Z'));
  });

  it('stays on the same local day for -4 (America/New_York, EDT)', () => {
    const info = localDayInfo(instant, 'America/New_York'); // 19:00Z -> 15:00
    expect(info.hour).toBe(15);
    expect(info.date).toBe('2026-06-10');
    expect(info.startOfDayMs).toBe(Date.parse('2026-06-10T04:00:00Z'));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter finby-api exec jest src/modules/reminders/reminders.time.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `apps/api/src/modules/reminders/reminders.time.ts`:

```ts
export interface LocalDayInfo {
  /** Local hour 0-23 at the given instant. */
  hour: number;
  /** Local calendar date as YYYY-MM-DD. */
  date: string;
  /** UTC epoch ms of local midnight (start of that local day). */
  startOfDayMs: number;
}

/** Resolve an instant into local-day info for an IANA timezone, with no
 *  external date library. Throws if the timezone is invalid. */
export function localDayInfo(now: Date, timeZone: string): LocalDayInfo {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(now)) parts[p.type] = p.value;

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const second = Number(parts.second);

  // The local wall-clock reinterpreted as if it were UTC.
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  // Positive when the timezone is ahead of UTC.
  const offsetMs = asUtc - now.getTime();
  const startOfDayMs = Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMs;

  return { hour, date: `${parts.year}-${parts.month}-${parts.day}`, startOfDayMs };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter finby-api exec jest src/modules/reminders/reminders.time.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/reminders/reminders.time.ts apps/api/src/modules/reminders/reminders.time.spec.ts
git commit -m "feat(api): add localDayInfo timezone helper for reminders"
```

---

## Task 5: Reminder copy variants

**Files:**
- Create: `apps/api/src/modules/reminders/reminders.copy.ts`
- Test: `apps/api/src/modules/reminders/reminders.copy.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/reminders/reminders.copy.spec.ts`:

```ts
import { reminderCopy, dayOfYearUtc } from './reminders.copy';

describe('reminderCopy', () => {
  it('substitutes the name and is deterministic per dayIndex', () => {
    const a = reminderCopy('Tea', 0);
    const b = reminderCopy('Tea', 0);
    expect(a).toEqual(b);
    expect(a.body).toContain('Tea');
    expect(a.title).toBe('Finby');
  });

  it('rotates variants across days', () => {
    const v0 = reminderCopy('Tea', 0).body;
    const v1 = reminderCopy('Tea', 1).body;
    expect(v0).not.toBe(v1);
  });

  it('falls back to "there" for an empty name', () => {
    expect(reminderCopy('  ', 2).body).toContain('there');
  });
});

describe('dayOfYearUtc', () => {
  it('returns a stable integer day index', () => {
    expect(dayOfYearUtc(new Date('2026-01-01T00:00:00Z'))).toBe(1);
    expect(dayOfYearUtc(new Date('2026-01-02T00:00:00Z'))).toBe(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter finby-api exec jest src/modules/reminders/reminders.copy.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the copy module**

Create `apps/api/src/modules/reminders/reminders.copy.ts`:

```ts
export interface ReminderCopy {
  title: string;
  body: string;
}

const VARIANTS: ReadonlyArray<(name: string) => string> = [
  (n) => `${n}, spent anything today? Log it in 5 seconds 💸`,
  (n) => `${n}, let's close out your day — what did you spend?`,
  (n) => `Quick check-in: anything to log before bed, ${n}?`,
  (n) => `${n}, keeping today honest? Tap to log your spending.`,
];

/** Pick a deterministic, name-personalized variant for a given day index. */
export function reminderCopy(name: string, dayIndex: number): ReminderCopy {
  const safe = name?.trim() || 'there';
  const i = ((dayIndex % VARIANTS.length) + VARIANTS.length) % VARIANTS.length;
  return { title: 'Finby', body: VARIANTS[i](safe) };
}

/** 1-based day-of-year in UTC; used to rotate copy variants deterministically. */
export function dayOfYearUtc(now: Date): number {
  const startOfYear = Date.UTC(now.getUTCFullYear(), 0, 0);
  return Math.floor((now.getTime() - startOfYear) / 86_400_000);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter finby-api exec jest src/modules/reminders/reminders.copy.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/reminders/reminders.copy.ts apps/api/src/modules/reminders/reminders.copy.spec.ts
git commit -m "feat(api): add rotating reminder copy variants"
```

---

## Task 6: RemindersService (selection + send + idempotency)

**Files:**
- Create: `apps/api/src/modules/reminders/reminders.service.ts`
- Test: `apps/api/src/modules/reminders/reminders.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/reminders/reminders.service.spec.ts`:

```ts
import { DEFAULT_PREFERENCES } from '@finby/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PushService } from '../push/push.service';
import { RemindersService } from './reminders.service';

// 20:00 UTC -> matches REMINDER_HOUR (20) for a UTC user.
const AT_8PM_UTC = new Date('2026-06-10T20:00:00Z');

interface MockUser {
  id: string;
  displayName: string;
  timezone: string;
  preferences: unknown;
}

function setup(opts: {
  users: MockUser[];
  loggedUserIds?: string[]; // users who already logged a txn today
}) {
  const sendToUserDevices = jest.fn().mockResolvedValue(undefined);
  const update = jest.fn().mockResolvedValue({});
  const logged = new Set(opts.loggedUserIds ?? []);

  const prisma = {
    pushSubscription: {
      findMany: jest.fn().mockResolvedValue(opts.users.map((u) => ({ userId: u.id }))),
    },
    user: {
      findMany: jest.fn().mockResolvedValue(opts.users),
      update,
    },
    transaction: {
      findFirst: jest.fn(({ where }: { where: { loggedByUserId: string } }) =>
        Promise.resolve(logged.has(where.loggedByUserId) ? { id: 't1' } : null),
      ),
    },
  } as unknown as PrismaService;

  const push = { sendToUserDevices } as unknown as PushService;
  const service = new RemindersService(prisma, push);
  return { service, sendToUserDevices, update };
}

const baseUser: MockUser = {
  id: 'u1',
  displayName: 'Tea',
  timezone: 'UTC',
  preferences: DEFAULT_PREFERENCES,
};

describe('RemindersService.sendDailyReminders', () => {
  it('pushes to an inactive user at 8pm local and stamps lastDailyReminderAt', async () => {
    const { service, sendToUserDevices, update } = setup({ users: [baseUser] });
    await service.sendDailyReminders(AT_8PM_UTC);

    expect(sendToUserDevices).toHaveBeenCalledTimes(1);
    expect(sendToUserDevices).toHaveBeenCalledWith('u1', expect.objectContaining({ url: '/chat' }));
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: expect.objectContaining({
          preferences: expect.objectContaining({ lastDailyReminderAt: '2026-06-10' }),
        }),
      }),
    );
  });

  it('skips users whose local hour is not 8pm', async () => {
    const tokyo: MockUser = { ...baseUser, timezone: 'Asia/Tokyo' }; // 20:00Z -> 05:00 next day
    const { service, sendToUserDevices } = setup({ users: [tokyo] });
    await service.sendDailyReminders(AT_8PM_UTC);
    expect(sendToUserDevices).not.toHaveBeenCalled();
  });

  it('skips users who already logged a transaction today', async () => {
    const { service, sendToUserDevices } = setup({ users: [baseUser], loggedUserIds: ['u1'] });
    await service.sendDailyReminders(AT_8PM_UTC);
    expect(sendToUserDevices).not.toHaveBeenCalled();
  });

  it('skips users who turned daily reminders off', async () => {
    const optedOut: MockUser = {
      ...baseUser,
      preferences: { ...DEFAULT_PREFERENCES, dailyReminders: false },
    };
    const { service, sendToUserDevices } = setup({ users: [optedOut] });
    await service.sendDailyReminders(AT_8PM_UTC);
    expect(sendToUserDevices).not.toHaveBeenCalled();
  });

  it('skips users already nudged today (idempotency stamp)', async () => {
    const stamped: MockUser = {
      ...baseUser,
      preferences: { ...DEFAULT_PREFERENCES, lastDailyReminderAt: '2026-06-10' },
    };
    const { service, sendToUserDevices } = setup({ users: [stamped] });
    await service.sendDailyReminders(AT_8PM_UTC);
    expect(sendToUserDevices).not.toHaveBeenCalled();
  });

  it('no-ops entirely when push is not configured/injected', async () => {
    const prisma = {
      pushSubscription: { findMany: jest.fn() },
    } as unknown as PrismaService;
    const service = new RemindersService(prisma);
    await service.sendDailyReminders(AT_8PM_UTC);
    expect(prisma.pushSubscription.findMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter finby-api exec jest src/modules/reminders/reminders.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `apps/api/src/modules/reminders/reminders.service.ts`:

```ts
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { parsePreferences } from '../auth/preferences.util';
import { localDayInfo } from './reminders.time';
import { dayOfYearUtc, reminderCopy } from './reminders.copy';

/** Local hour (0-23) at which the daily nudge fires. */
const REMINDER_HOUR = 20; // ~8pm local

interface ReminderUser {
  id: string;
  displayName: string;
  timezone: string;
  preferences: unknown;
}

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  // push is optional so unit tests can construct the service with just prisma,
  // and so the feature cleanly no-ops when push isn't wired/configured.
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly push?: PushService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runHourlyReminderSweep(): Promise<void> {
    try {
      await this.sendDailyReminders();
    } catch (err) {
      this.logger.error(`Daily reminder sweep failed: ${this.describe(err)}`);
    }
  }

  /** Nudge every push-enabled user for whom it is now ~8pm local, who has
   *  reminders on, hasn't been nudged today, and hasn't logged a transaction
   *  since their local midnight. One push per user across all devices. */
  async sendDailyReminders(now = new Date()): Promise<void> {
    if (!this.push) return;

    const subscribed = await this.prisma.pushSubscription.findMany({
      distinct: ['userId'],
      select: { userId: true },
    });
    if (subscribed.length === 0) return;

    const users = await this.prisma.user.findMany({
      where: { id: { in: subscribed.map((s) => s.userId) } },
      select: { id: true, displayName: true, timezone: true, preferences: true },
    });

    const dayIndex = dayOfYearUtc(now);
    for (const user of users) {
      try {
        await this.maybeRemind(user, now, dayIndex);
      } catch (err) {
        this.logger.warn(`Reminder check failed for user ${user.id}: ${this.describe(err)}`);
      }
    }
  }

  private async maybeRemind(user: ReminderUser, now: Date, dayIndex: number): Promise<void> {
    const prefs = parsePreferences(user.preferences);
    if (prefs.dailyReminders === false) return;

    let day;
    try {
      day = localDayInfo(now, user.timezone || 'UTC');
    } catch {
      day = localDayInfo(now, 'UTC'); // bad tz string -> treat as UTC
    }
    if (day.hour !== REMINDER_HOUR) return;
    if (prefs.lastDailyReminderAt === day.date) return;

    const logged = await this.prisma.transaction.findFirst({
      where: { loggedByUserId: user.id, createdAt: { gte: new Date(day.startOfDayMs) } },
      select: { id: true },
    });
    if (logged) return;

    const { title, body } = reminderCopy(user.displayName, dayIndex);
    await this.push?.sendToUserDevices(user.id, { title, body, url: '/chat' });

    await this.stamp(user.id, user.preferences, day.date);
  }

  /** Record that we nudged this user today, preserving other preferences. */
  private async stamp(userId: string, current: unknown, date: string): Promise<void> {
    const merged = { ...parsePreferences(current), lastDailyReminderAt: date };
    await this.prisma.user.update({
      where: { id: userId },
      data: { preferences: merged as unknown as Prisma.InputJsonValue },
    });
  }

  private describe(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter finby-api exec jest src/modules/reminders/reminders.service.spec.ts`
Expected: PASS (all 6 cases).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/reminders/reminders.service.ts apps/api/src/modules/reminders/reminders.service.spec.ts
git commit -m "feat(api): add RemindersService daily nudge logic"
```

---

## Task 7: Wire the RemindersModule into the app

**Files:**
- Create: `apps/api/src/modules/reminders/reminders.module.ts`
- Modify: `apps/api/src/app.module.ts` (import + `imports:` array near line 98)

- [ ] **Step 1: Create the module**

Create `apps/api/src/modules/reminders/reminders.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { RemindersService } from './reminders.service';

@Module({
  imports: [PushModule],
  providers: [RemindersService],
})
export class RemindersModule {}
```

- [ ] **Step 2: Register it in `app.module.ts`**

Add the import near the other module imports at the top of `apps/api/src/app.module.ts`:

```ts
import { RemindersModule } from './modules/reminders/reminders.module';
```

Add `RemindersModule` to the `imports:` array (place it right after `PushModule`):

```ts
    PushModule,
    RemindersModule,
```

- [ ] **Step 3: Build the API to verify wiring + DI resolve**

Run: `pnpm --filter finby-api build`
Expected: `nest build` succeeds with no DI/type errors.

- [ ] **Step 4: Run the full API test suite**

Run: `pnpm --filter finby-api test`
Expected: PASS (all suites, including the new reminders specs).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/reminders/reminders.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): register RemindersModule with hourly cron"
```

---

## Task 8: Web — daily reminder toggle in settings

Adds an optional `onStateChange` callback to `NotifToggle` (so the settings page knows when push is on), then renders a "Daily reminder" switch gated on push being enabled.

**Files:**
- Modify: `apps/web/src/components/chat/notif-toggle.tsx`
- Modify: `apps/web/src/components/settings/preferences-section.tsx`
- Test: `apps/web/src/components/settings/preferences-section.test.tsx`

- [ ] **Step 1: Add `onStateChange` to `NotifToggle`**

In `apps/web/src/components/chat/notif-toggle.tsx`, change the component signature and route every state change through a helper. Replace the `export function NotifToggle() {` line and the two state-setting sites:

```tsx
export function NotifToggle({ onStateChange }: { onStateChange?: (s: PushState) => void } = {}) {
  const workspace = useAuth((s) => s.workspace);
  const [state, setState] = useState<PushState>('off');
  const [busy, setBusy] = useState(false);

  const apply = (s: PushState) => {
    setState(s);
    onStateChange?.(s);
  };

  useEffect(() => {
    if (!isPushSupported()) {
      apply('unsupported');
      return;
    }
    getPushState()
      .then(apply)
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

And inside `toggle()`, replace the `setState(...)` line with:

```tsx
      apply(on ? await disablePush(workspace.id) : await enablePush(workspace.id));
```

(Leave the rest of the component unchanged. The chat header usage `<NotifToggle />` still works because the prop is optional.)

- [ ] **Step 2: Add the reminder switch to `PreferencesSection`**

In `apps/web/src/components/settings/preferences-section.tsx`:

(a) Add a `pushOn` state at the top of the component, just after the `saveState` state:

```tsx
  const [pushOn, setPushOn] = useState(false);
```

(b) Replace the existing push-notifications row (the `<div className="flex items-center justify-between gap-3 border-t border-line pt-4">` block containing `<NotifToggle />`) with the push row wired to `onStateChange` plus a new reminder row:

```tsx
        <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
          <div>
            <p className="text-sm font-medium text-ink">Push notifications</p>
            <p className="text-xs text-muted">
              Get alerts on this device for reminders and updates.
            </p>
          </div>
          <NotifToggle onStateChange={(s) => setPushOn(s === 'on')} />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
          <div>
            <p className="text-sm font-medium text-ink">Daily reminder</p>
            <p className="text-xs text-muted">
              A nudge at ~8pm if you haven&apos;t logged anything that day. Requires notifications on.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.dailyReminders}
            aria-label="Daily reminder"
            disabled={!pushOn || saveState === 'saving'}
            onClick={() => savePref({ dailyReminders: !prefs.dailyReminders })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full border transition disabled:opacity-40 ${
              prefs.dailyReminders ? 'border-accent/50 bg-accent' : 'border-line bg-surface'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                prefs.dailyReminders ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
```

(c) Ensure `useState` is imported (it already is) and `prefs.dailyReminders` resolves — it does, because `prefs` falls back to `DEFAULT_PREFERENCES` which now includes `dailyReminders: true`.

- [ ] **Step 3: Add tests for the switch**

Append to `apps/web/src/components/settings/preferences-section.test.tsx` (inside the `describe('PreferencesSection')` block):

```ts
  it('disables the daily-reminder switch while push is off', async () => {
    render(<PreferencesSection />);
    const sw = await screen.findByRole('switch', { name: 'Daily reminder' });
    expect(sw).toBeDisabled();
  });

  it('enables the switch when push is on and saves dailyReminders on click', async () => {
    const { getPushState } = await import('../../lib/push');
    vi.mocked(getPushState).mockResolvedValueOnce('on');
    mockUpdateProfile.mockResolvedValue({
      ...USER,
      preferences: { ...DEFAULT_PREFERENCES, dailyReminders: false },
    });

    render(<PreferencesSection />);

    const sw = await screen.findByRole('switch', { name: 'Daily reminder' });
    await waitFor(() => expect(sw).toBeEnabled());

    fireEvent.click(sw);
    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({ preferences: { dailyReminders: false } });
    });
  });
```

- [ ] **Step 4: Run the web test file to verify all pass**

Run: `pnpm --filter finby-web exec vitest run src/components/settings/preferences-section.test.tsx`
Expected: PASS — original two tests plus the two new ones.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/chat/notif-toggle.tsx apps/web/src/components/settings/preferences-section.tsx apps/web/src/components/settings/preferences-section.test.tsx
git commit -m "feat(web): add daily reminder toggle to settings"
```

---

## Task 8.5: iOS "install to home screen" hint (optional but recommended)

On iOS, Web Push only works in an installed PWA. In a plain Safari tab `isPushSupported()` is false and the notification controls are hidden — so iPhone users never learn they *could* get reminders by installing. This task shows a short install CTA in that exact situation, which directly serves the iOS re-engagement goal.

**Files:**
- Create: `apps/web/src/lib/ios.ts`
- Create: `apps/web/src/lib/ios.test.ts`
- Modify: `apps/web/src/components/settings/preferences-section.tsx`

- [ ] **Step 1: Write the failing test for the iOS detector**

Create `apps/web/src/lib/ios.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isIosSafariTab } from './ios';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36';

describe('isIosSafariTab', () => {
  it('is true for an iPhone UA that is not standalone', () => {
    expect(isIosSafariTab(IPHONE, false)).toBe(true);
  });
  it('is false for an installed (standalone) iPhone PWA', () => {
    expect(isIosSafariTab(IPHONE, true)).toBe(false);
  });
  it('is false for non-iOS devices', () => {
    expect(isIosSafariTab(ANDROID, false)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter finby-web exec vitest run src/lib/ios.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the detector**

Create `apps/web/src/lib/ios.ts`:

```ts
/** True when running in an iOS Safari browser tab that is NOT an installed PWA.
 *  Web Push is unavailable here — the user must Add to Home Screen first.
 *  Pure inputs so it is unit-testable; call sites pass live values. */
export function isIosSafariTab(
  userAgent: string,
  standalone: boolean,
): boolean {
  const isIos = /iPad|iPhone|iPod/.test(userAgent);
  return isIos && !standalone;
}

/** Browser-evaluated convenience wrapper. */
export function detectIosSafariTab(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return isIosSafariTab(navigator.userAgent, Boolean(standalone));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter finby-web exec vitest run src/lib/ios.test.ts`
Expected: PASS.

- [ ] **Step 5: Show the hint in `PreferencesSection`**

In `apps/web/src/components/settings/preferences-section.tsx`:

(a) Add the import:

```tsx
import { detectIosSafariTab } from '@/lib/ios';
```

(b) Add iOS state and detection after the `pushOn` state:

```tsx
  const [iosTab, setIosTab] = useState(false);
  useEffect(() => {
    setIosTab(detectIosSafariTab());
  }, []);
```

(Ensure `useEffect` is added to the existing `react` import alongside `useState`.)

(c) Directly above the "Push notifications" row, render the hint when on an iOS Safari tab:

```tsx
        {iosTab ? (
          <div className="rounded-xl border border-line bg-surface/60 p-3 text-xs text-muted">
            To get reminders on iPhone, tap the Share icon and choose{' '}
            <span className="font-medium text-ink">Add to Home Screen</span>, then open Finby from
            your home screen.
          </div>
        ) : null}
```

- [ ] **Step 6: Verify the web tests still pass**

Run: `pnpm --filter finby-web exec vitest run src/components/settings/preferences-section.test.tsx`
Expected: PASS (the existing mocks make `detectIosSafariTab` return false under jsdom's default UA, so the hint is absent and prior assertions hold).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/ios.ts apps/web/src/lib/ios.test.ts apps/web/src/components/settings/preferences-section.tsx
git commit -m "feat(web): prompt iOS Safari users to install for reminders"
```

---

## Task 9: Full verification

- [ ] **Step 1: Typecheck the monorepo**

Run: `pnpm typecheck`
Expected: PASS across `@finby/shared`, `finby-api`, `finby-web`.

- [ ] **Step 2: Run all tests**

Run: `pnpm test`
Expected: PASS across all workspaces.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 4: Confirm there is nothing left to commit**

Run: `git status --porcelain`
Expected: empty output.

---

## Deploy-time follow-up (not code — do not skip)

The feature is fully dormant until VAPID keys exist in the API environment:

1. Generate keys: `npx web-push generate-vapid-keys`
2. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (and optionally `VAPID_SUBJECT`) in the API service env (Render). **Do not commit them.**
3. After deploy, verify in the app: enable notifications in Settings, confirm the Daily reminder switch becomes enabled, and confirm a `pushSubscription` row is created.

**iOS note for QA:** On iPhone/iPad, notifications only work when Finby is installed to the home screen (Add to Home Screen). In a plain Safari tab `isPushSupported()` is false, so the notification controls are correctly hidden.
```
