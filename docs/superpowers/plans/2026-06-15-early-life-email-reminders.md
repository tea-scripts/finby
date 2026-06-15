# Early-Life Email Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email a gentle streak nudge to brand-new users (first 7 days) who haven't installed/enabled push and haven't logged today, every other evening, closing the day-0→day-7 gap before the existing 7-day re-engagement takes over.

**Architecture:** A new `EarlyReminderService` mirrors `ReengagementService`: an hourly cron that, for each user created within the last 7 days, with no push subscription, email-verified, reminders-on, and no transaction logged today, sends a streak-aware email at ~8pm local and stamps `preferences.lastEarlyReminderAt`. An every-other-day gap cap prevents fatigue; the 7-day window guarantees no overlap with re-engagement (which excludes new signups).

**Tech Stack:** NestJS + `@nestjs/schedule` + Prisma (Jest tests), Resend via existing `EmailService`. Reuses `reminders.time.ts`, `preferences.util.ts`, and the email template shell.

**Part of:** `docs/superpowers/specs/2026-06-15-day0-retention-and-streak-calendar-design.md` (Part A). Independent of Parts B/C.

---

### Task 1: Add `lastEarlyReminderAt` to preferences (shared + API)

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/constants.ts`
- Modify: `apps/api/src/modules/auth/preferences.util.ts`

- [ ] **Step 1: Extend the shared type**

In `packages/shared/src/types.ts`, inside `interface UserPreferences`, after the `lastReengagedAt` field add:

```typescript
  /** Internal: ISO timestamp of the last early-life (first-week) reminder email.
   *  Set server-side; null until first send. */
  lastEarlyReminderAt: string | null;
```

- [ ] **Step 2: Extend the defaults**

In `packages/shared/src/constants.ts`, inside `DEFAULT_PREFERENCES`, after `lastReengagedAt: null,` add:

```typescript
  lastEarlyReminderAt: null,
```

- [ ] **Step 3: Extend the validator**

In `apps/api/src/modules/auth/preferences.util.ts`, inside the `preferencesSchema` object, after `lastReengagedAt: z.string().nullable(),` add:

```typescript
    lastEarlyReminderAt: z.string().nullable(),
```

- [ ] **Step 4: Build shared + verify types compile**

Run: `cd packages/shared && npm run build`
Expected: PASS (the new field is part of the published types).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/src/constants.ts apps/api/src/modules/auth/preferences.util.ts
git commit -m "feat(shared): lastEarlyReminderAt preference for early-life reminders"
```

---

### Task 2: Email template + service method (API)

**Files:**
- Modify: `apps/api/src/modules/email/email.templates.ts`
- Modify: `apps/api/src/modules/email/email.service.ts`
- Test: `apps/api/src/modules/email/email.templates.spec.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

Create (or append to) `apps/api/src/modules/email/email.templates.spec.ts`:

```typescript
import { earlyReminderEmail } from './email.templates';

describe('earlyReminderEmail', () => {
  it('uses streak-keeping copy when the user has a streak', () => {
    const { subject, html } = earlyReminderEmail('Alex', 3, 'https://chat.finby.app/chat');
    expect(subject).toMatch(/keep your streak/i);
    expect(html).toContain('3-day');
    expect(html).toContain('https://chat.finby.app/chat');
  });

  it('uses start-a-streak copy when the user has none yet', () => {
    const { subject, html } = earlyReminderEmail('Alex', 0, 'https://chat.finby.app/chat');
    expect(subject).toMatch(/start your/i);
    expect(html).toContain('Alex');
  });

  it('escapes the user name', () => {
    const { html } = earlyReminderEmail('<b>x</b>', 1, 'https://x/chat');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/modules/email/email.templates.spec.ts`
Expected: FAIL — `earlyReminderEmail` is not exported.

- [ ] **Step 3: Add the template**

In `apps/api/src/modules/email/email.templates.ts`, after `reengagementEmail`, add (`streak` is a number, not user input, so it is safe to interpolate; `name` is escaped via `esc`):

```typescript
export function earlyReminderEmail(
  name: string,
  streak: number,
  openUrl: string,
): { subject: string; html: string } {
  const hasStreak = streak >= 1;
  const lead = hasStreak
    ? `You're on a <strong style="color:#e8eef7;">${streak}-day</strong> streak 🔥 — log one thing today to keep it alive.`
    : `Build the habit in seconds: tell Finby one thing you spent today and start your streak 🔥.`;
  return {
    subject: hasStreak ? 'Keep your Finby streak going 🔥' : 'Start your Finby streak 🔥',
    html: SHELL(
      `<h1 style="font-size:20px;margin:0 0 12px;color:#e8eef7;">Hey ${esc(name)} 👋</h1>
      <p style="margin:0 0 10px;line-height:1.5;color:#8da3c0;">${lead}</p>
      <p style="margin:0 0 22px;line-height:1.5;color:#8da3c0;">Just say <em style="color:#e8eef7;">"spent 12 on lunch"</em>.</p>
      ${button(openUrl, 'Open Finby')}`,
      "You're receiving this because reminders are on for your Finby account — you can turn them off any time in Settings.",
    ),
  };
}
```

- [ ] **Step 4: Add the service method**

In `apps/api/src/modules/email/email.service.ts`, add `earlyReminderEmail` to the import list from `./email.templates`, then add the method (e.g. after `sendReengagement`):

```typescript
async sendEarlyReminder(to: string, name: string, streak: number, openUrl: string): Promise<void> {
  const { subject, html } = earlyReminderEmail(name, streak, openUrl);
  await this.provider.send({ to, subject, html });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && npx jest src/modules/email/email.templates.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/email/email.templates.ts apps/api/src/modules/email/email.service.ts apps/api/src/modules/email/email.templates.spec.ts
git commit -m "feat(email): early-life reminder template + sendEarlyReminder"
```

---

### Task 3: `EarlyReminderService` (API)

**Files:**
- Create: `apps/api/src/modules/reminders/early-reminder.service.ts`
- Test: `apps/api/src/modules/reminders/early-reminder.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/modules/reminders/early-reminder.service.spec.ts
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import type { EmailService } from '../email/email.service';
import type { Env } from '../../config/env.schema';
import { EarlyReminderService } from './early-reminder.service';

// 20:00 UTC -> matches SEND_HOUR (20) for a UTC user.
const AT_8PM_UTC = new Date('2026-06-10T20:00:00Z');

interface MockUser {
  id: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  timezone: string;
  currentStreak: number;
  preferences: unknown;
}

const newUser = (id: string, over: Partial<MockUser> = {}): MockUser => ({
  id,
  displayName: 'Alex',
  email: `${id}@x.com`,
  emailVerified: true,
  timezone: 'UTC',
  currentStreak: 1,
  preferences: {},
  ...over,
});

function setup(opts: {
  users?: MockUser[];
  pushUserIds?: string[];
  loggedTodayUserIds?: string[];
}) {
  const loggedToday = new Set(opts.loggedTodayUserIds ?? []);
  const prisma = {
    user: {
      findMany: jest.fn().mockResolvedValue(opts.users ?? []),
      update: jest.fn().mockResolvedValue({}),
    },
    pushSubscription: {
      findMany: jest.fn().mockResolvedValue((opts.pushUserIds ?? []).map((userId) => ({ userId }))),
    },
    transaction: {
      // returns a row only for users who logged today
      findFirst: jest.fn((args: { where: { loggedByUserId: string } }) =>
        Promise.resolve(loggedToday.has(args.where.loggedByUserId) ? { id: 'tx' } : null),
      ),
    },
  };
  const email = { sendEarlyReminder: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn().mockReturnValue('https://chat.finby.app') };

  const service = new EarlyReminderService(
    prisma as unknown as PrismaService,
    email as unknown as EmailService,
    config as unknown as ConfigService<Env, true>,
  );
  return { service, prisma, email };
}

describe('EarlyReminderService', () => {
  it('emails a new, verified, push-less user who has not logged today, and stamps', async () => {
    const { service, prisma, email } = setup({ users: [newUser('u1', { currentStreak: 2 })] });

    await service.sendEarlyReminders(AT_8PM_UTC);

    expect(email.sendEarlyReminder).toHaveBeenCalledWith(
      'u1@x.com',
      'Alex',
      2,
      'https://chat.finby.app/chat',
    );
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
  });

  it('skips users who have a push subscription', async () => {
    const { service, email } = setup({ users: [newUser('u1')], pushUserIds: ['u1'] });
    await service.sendEarlyReminders(AT_8PM_UTC);
    expect(email.sendEarlyReminder).not.toHaveBeenCalled();
  });

  it('skips users who already logged a transaction today', async () => {
    const { service, email } = setup({ users: [newUser('u1')], loggedTodayUserIds: ['u1'] });
    await service.sendEarlyReminders(AT_8PM_UTC);
    expect(email.sendEarlyReminder).not.toHaveBeenCalled();
  });

  it('skips when it is not the send hour locally', async () => {
    const { service, email } = setup({ users: [newUser('u1')] });
    await service.sendEarlyReminders(new Date('2026-06-10T10:00:00Z'));
    expect(email.sendEarlyReminder).not.toHaveBeenCalled();
  });

  it('respects the dailyReminders=false opt-out', async () => {
    const { service, email } = setup({
      users: [newUser('u1', { preferences: { dailyReminders: false } })],
    });
    await service.sendEarlyReminders(AT_8PM_UTC);
    expect(email.sendEarlyReminder).not.toHaveBeenCalled();
  });

  it('respects the every-other-day gap', async () => {
    const yesterday = new Date(AT_8PM_UTC.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const { service, email } = setup({
      users: [newUser('u1', { preferences: { lastEarlyReminderAt: yesterday } })],
    });
    await service.sendEarlyReminders(AT_8PM_UTC);
    expect(email.sendEarlyReminder).not.toHaveBeenCalled();
  });

  it('skips unverified users', async () => {
    const { service, email } = setup({ users: [newUser('u1', { emailVerified: false })] });
    await service.sendEarlyReminders(AT_8PM_UTC);
    expect(email.sendEarlyReminder).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/modules/reminders/early-reminder.service.spec.ts`
Expected: FAIL — `Cannot find module './early-reminder.service'`.

- [ ] **Step 3: Write the service**

```typescript
// apps/api/src/modules/reminders/early-reminder.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import type { UserPreferences } from '@finby/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import type { Env } from '../../config/env.schema';
import { parsePreferences } from '../auth/preferences.util';
import { localDayInfo } from './reminders.time';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Only users this new get the first-week reminder; after this the existing
 *  re-engagement sweep (which excludes new signups) owns them. */
const EARLY_WINDOW_DAYS = 7;
/** Minimum days between two early reminders for one user (every other day). */
const MIN_GAP_DAYS = 2;
/** Local hour (0-23) at which the email goes out (~8pm). */
const SEND_HOUR = 20;

interface EarlyUser {
  id: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  timezone: string;
  currentStreak: number;
  preferences: unknown;
}

/** First-week email nudges for users who haven't enabled push and aren't yet
 *  logging daily. Email-only (push users are handled by the daily push nudge),
 *  capped to one every MIN_GAP_DAYS, gated on the dailyReminders preference. */
@Injectable()
export class EarlyReminderService {
  private readonly logger = new Logger(EarlyReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runHourlySweep(): Promise<void> {
    try {
      await this.sendEarlyReminders();
    } catch (err) {
      this.logger.error(`Early reminder sweep failed: ${this.describe(err)}`);
    }
  }

  /** Nudge every eligible new user for whom it is now ~8pm local. */
  async sendEarlyReminders(now = new Date()): Promise<void> {
    const windowStart = new Date(now.getTime() - EARLY_WINDOW_DAYS * DAY_MS);

    const candidates: EarlyUser[] = await this.prisma.user.findMany({
      where: { createdAt: { gte: windowStart }, emailVerified: true },
      select: {
        id: true,
        displayName: true,
        email: true,
        emailVerified: true,
        timezone: true,
        currentStreak: true,
        preferences: true,
      },
    });
    if (candidates.length === 0) return;

    const subscribed = await this.prisma.pushSubscription.findMany({
      where: { userId: { in: candidates.map((u) => u.id) } },
      distinct: ['userId'],
      select: { userId: true },
    });
    const pushUserIds = new Set(subscribed.map((s) => s.userId));
    const openUrl = `${this.config.get('WEB_URL', { infer: true })}/chat`;

    for (const user of candidates) {
      if (pushUserIds.has(user.id)) continue; // push users get the daily push nudge
      try {
        await this.maybeRemind(user, openUrl, now);
      } catch (err) {
        this.logger.warn(`Early reminder failed for user ${user.id}: ${this.describe(err)}`);
      }
    }
  }

  private async maybeRemind(user: EarlyUser, openUrl: string, now: Date): Promise<void> {
    const prefs = parsePreferences(user.preferences);
    if (prefs.dailyReminders === false) return;

    let day: ReturnType<typeof localDayInfo>;
    try {
      day = localDayInfo(now, user.timezone || 'UTC');
    } catch {
      day = localDayInfo(now, 'UTC');
    }
    if (day.hour !== SEND_HOUR) return;

    if (prefs.lastEarlyReminderAt) {
      const last = Date.parse(prefs.lastEarlyReminderAt);
      if (Number.isFinite(last) && now.getTime() - last < MIN_GAP_DAYS * DAY_MS) return;
    }

    // Already forming the habit today -> stay silent.
    const loggedToday = await this.prisma.transaction.findFirst({
      where: { loggedByUserId: user.id, createdAt: { gte: new Date(day.startOfDayMs) } },
      select: { id: true },
    });
    if (loggedToday) return;

    const name = user.displayName?.trim() || 'there';
    await this.email.sendEarlyReminder(user.email, name, user.currentStreak, openUrl);
    await this.stamp(user.id, user.preferences, now.toISOString());
  }

  /** Merge the early-reminder stamp into preferences (same negligible-collision
   *  caveat as RemindersService/ReengagementService). */
  private async stamp(userId: string, current: unknown, iso: string): Promise<void> {
    const patch: Partial<UserPreferences> = { lastEarlyReminderAt: iso };
    const merged = { ...parsePreferences(current), ...patch };
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

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/modules/reminders/early-reminder.service.spec.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/reminders/early-reminder.service.ts apps/api/src/modules/reminders/early-reminder.service.spec.ts
git commit -m "feat(reminders): EarlyReminderService for first-week email nudges"
```

---

### Task 4: Register the service (API)

**Files:**
- Modify: `apps/api/src/modules/reminders/reminders.module.ts`

- [ ] **Step 1: Add the provider**

Update `apps/api/src/modules/reminders/reminders.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { EmailModule } from '../email/email.module';
import { RemindersService } from './reminders.service';
import { ReengagementService } from './reengagement.service';
import { EarlyReminderService } from './early-reminder.service';

@Module({
  imports: [PushModule, EmailModule],
  providers: [RemindersService, ReengagementService, EarlyReminderService],
})
export class RemindersModule {}
```

(`ConfigService` is provided globally — `ReengagementService` already injects it from this same module, so no extra import is needed.)

- [ ] **Step 2: Verify the app boots / compiles**

Run: `cd apps/api && npm run build`
Expected: PASS — Nest resolves `EarlyReminderService` dependencies.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/reminders/reminders.module.ts
git commit -m "feat(reminders): register EarlyReminderService"
```

---

### Task 5: Full verification

- [ ] **Step 1: Shared build**

Run: `cd packages/shared && npm run build`
Expected: PASS.

- [ ] **Step 2: API tests + lint + build**

Run: `cd apps/api && npm run test && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 3: Manual smoke (optional, requires RESEND + a recent test account)**

Temporarily call `sendEarlyReminders(new Date())` (or wait for the hourly cron at the local 8pm of a freshly-created, email-verified, push-less account with no transaction that day) and confirm the email arrives with streak-aware copy, then that `preferences.lastEarlyReminderAt` is stamped and a same-evening re-run does not re-send.
