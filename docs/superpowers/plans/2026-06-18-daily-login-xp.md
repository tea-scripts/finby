# Daily Login XP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Award every user (scaled by plan) +1 base XP the first time they are active in the app on each local calendar day, independent of logging a transaction.

**Architecture:** A new `DailyLoginService` (gamification module) resolves the user's timezone + workspace tier, performs a race-safe once-per-local-day guard via a conditional `updateMany`, and grants XP through the existing `XpService.awardXp`. `AuthService.getMe()` (backing `GET /auth/me`, hit on login and every session restore) calls it best-effort so it covers users who stay logged in and never breaks authentication.

**Tech Stack:** NestJS, Prisma (PostgreSQL), TypeScript, Jest. Monorepo; API lives in `apps/api`.

## Global Constraints

- XP amount is **tier-scaled** via the existing `XP_MULTIPLIER` (`FREE` 1× / `PRO` 3× / `PREMIUM` 5× / `FAMILY` 5×) — reuse `XpService.awardXp`, do not hardcode amounts.
- The daily award fires **at most once per user per local calendar day**, resolved in the user's own timezone via `localDayInfo` (UTC fallback on a bad timezone string), matching the streak code.
- The award is **best-effort**: any failure inside `getMe()` is caught and logged, never propagated — authentication must still succeed.
- Do NOT reuse `User.lastLoginAt` (a `DateTime` for admin analytics, set only on explicit login). Use the new `lastDailyXpDate` string field.
- All commands run from `apps/api` unless stated otherwise. Spec: `docs/superpowers/specs/2026-06-18-daily-login-xp-design.md`.

---

### Task 1: Schema, migration, and XP constant for `DAILY_LOGIN`

Adds the new enum value, the idempotency column, and the base XP amount. Verification is the TypeScript compiler: `XP_BASE` is typed `Record<XpEvent, number>`, so once the regenerated Prisma client includes `DAILY_LOGIN`, omitting it from `XP_BASE` is a compile error — that is this task's failing → passing gate.

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (XpEvent enum ~line 911-918; User model ~line 176)
- Modify: `apps/api/src/modules/gamification/xp.constants.ts:15-22`
- Create (generated): `apps/api/prisma/migrations/<timestamp>_daily_login_xp/migration.sql`

**Interfaces:**
- Produces: `XpEvent.DAILY_LOGIN` (Prisma enum), `User.lastDailyXpDate: string | null`, `XP_BASE[XpEvent.DAILY_LOGIN] === 1`.

- [ ] **Step 1: Add the enum value**

In `apps/api/prisma/schema.prisma`, add `DAILY_LOGIN` to the `XpEvent` enum:

```prisma
enum XpEvent {
  STREAK_DAY
  STREAK_MILESTONE
  TRANSACTION_LOGGED
  GOAL_HIT
  STREAK_RECOVERY
  REFERRAL_BONUS
  DAILY_LOGIN
}
```

- [ ] **Step 2: Add the idempotency column to `User`**

In the `User` model, immediately after the `lastStreakRepairDate` field (~line 185), add:

```prisma
  // YYYY-MM-DD local date of the user's last daily-login XP award. Mirrors the
  // lastStreakDate convention; the once-per-local-day idempotency key.
  lastDailyXpDate   String?
```

- [ ] **Step 3: Generate the migration + client**

Run: `npm run prisma:migrate -- --name daily_login_xp`
Expected: a new folder `prisma/migrations/<timestamp>_daily_login_xp/` with `ALTER TYPE "XpEvent" ADD VALUE 'DAILY_LOGIN';` and `ALTER TABLE "User" ADD COLUMN "lastDailyXpDate" TEXT;`, and the Prisma client regenerates. Command exits 0.

> If the local DB is unavailable, run `npx prisma generate` to refresh the client and create the migration SQL by hand from the diff; the column is nullable so it is a safe additive migration.

- [ ] **Step 4: Add the base XP amount**

In `apps/api/src/modules/gamification/xp.constants.ts`, add `DAILY_LOGIN` to `XP_BASE`:

```ts
export const XP_BASE: Record<XpEvent, number> = {
  STREAK_DAY: 1,
  STREAK_MILESTONE: 5,
  TRANSACTION_LOGGED: 1,
  GOAL_HIT: 2,
  STREAK_RECOVERY: 0,
  REFERRAL_BONUS: 0,
  DAILY_LOGIN: 1,
};
```

- [ ] **Step 5: Typecheck (the gate)**

Run: `npm run typecheck`
Expected: PASS. (Before Step 4, the regenerated `XpEvent` would make `XP_BASE` non-exhaustive and fail — confirming the constant is required.)

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/modules/gamification/xp.constants.ts
git commit -m "feat(gamification): add DAILY_LOGIN XP event and lastDailyXpDate column"
```

---

### Task 2: `DailyLoginService` — once-per-day, tier-scaled award

The core logic, fully unit-tested with a mocked Prisma + XpService (mirroring `xp.service.spec.ts`).

**Files:**
- Create: `apps/api/src/modules/gamification/daily-login.service.ts`
- Create: `apps/api/src/modules/gamification/daily-login.service.spec.ts`
- Modify: `apps/api/src/modules/gamification/gamification.module.ts`

**Interfaces:**
- Consumes: `XpService.awardXp(userId, tier, event, meta?)`, `localDayInfo(now, tz)` from `../reminders/reminders.time`, `XpEvent.DAILY_LOGIN`.
- Produces: `DailyLoginService.awardIfFirstToday(userId: string, now?: Date): Promise<boolean>` — returns `true` only when this call performed the award. Resolves tier from the user's primary (earliest-joined) workspace.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/modules/gamification/daily-login.service.spec.ts`:

```ts
import { XpEvent } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { XpService } from './xp.service';
import { DailyLoginService } from './daily-login.service';
import * as time from '../reminders/reminders.time';

jest.mock('../reminders/reminders.time', () => {
  const actual = jest.requireActual('../reminders/reminders.time');
  return { ...actual, localDayInfo: jest.fn() };
});
const localDayInfo = time.localDayInfo as jest.MockedFunction<typeof time.localDayInfo>;

interface Overrides {
  user?: { timezone: string; workspaceMemberships: { workspace: { tier: string } }[] } | null;
  updateCount?: number;
}

function build(overrides: Overrides = {}) {
  const userFindUnique = jest.fn().mockResolvedValue(
    overrides.user === undefined
      ? { timezone: 'UTC', workspaceMemberships: [{ workspace: { tier: 'FREE' } }] }
      : overrides.user,
  );
  const userUpdateMany = jest.fn().mockResolvedValue({ count: overrides.updateCount ?? 1 });
  const prisma = {
    user: { findUnique: userFindUnique, updateMany: userUpdateMany },
  } as unknown as PrismaService;
  const awardXp = jest.fn().mockResolvedValue(undefined);
  const xpService = { awardXp } as unknown as XpService;
  return { prisma, xpService, userFindUnique, userUpdateMany, awardXp };
}

beforeEach(() => {
  localDayInfo.mockReset();
  localDayInfo.mockReturnValue({ hour: 9, date: '2026-06-18', startOfDayMs: 1_000 });
});

describe('DailyLoginService.awardIfFirstToday', () => {
  it('awards tier-scaled XP and stamps the date on the first activity of the day', async () => {
    const { prisma, xpService, userUpdateMany, awardXp } = build({
      user: { timezone: 'Asia/Manila', workspaceMemberships: [{ workspace: { tier: 'PREMIUM' } }] },
    });
    const service = new DailyLoginService(prisma, xpService);

    const awarded = await service.awardIfFirstToday('u1');

    expect(localDayInfo).toHaveBeenCalledWith(expect.any(Date), 'Asia/Manila');
    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { id: 'u1', lastDailyXpDate: { not: '2026-06-18' } },
      data: { lastDailyXpDate: '2026-06-18' },
    });
    expect(awardXp).toHaveBeenCalledWith('u1', 'PREMIUM', XpEvent.DAILY_LOGIN, { date: '2026-06-18' });
    expect(awarded).toBe(true);
  });

  it('is a no-op when already awarded today (guard matched no rows)', async () => {
    const { prisma, xpService, awardXp } = build({ updateCount: 0 });
    const service = new DailyLoginService(prisma, xpService);

    const awarded = await service.awardIfFirstToday('u1');

    expect(awardXp).not.toHaveBeenCalled();
    expect(awarded).toBe(false);
  });

  it('falls back to UTC when the timezone is invalid', async () => {
    const { prisma, xpService } = build({
      user: { timezone: 'Not/AZone', workspaceMemberships: [{ workspace: { tier: 'FREE' } }] },
    });
    localDayInfo.mockReset();
    localDayInfo.mockImplementation((_now: Date, tz: string) => {
      if (tz === 'Not/AZone') throw new RangeError('bad tz');
      return { hour: 0, date: '2026-06-18', startOfDayMs: 0 };
    });
    const service = new DailyLoginService(prisma, xpService);

    await expect(service.awardIfFirstToday('u1')).resolves.toBe(true);
    expect(localDayInfo).toHaveBeenLastCalledWith(expect.any(Date), 'UTC');
  });

  it('does nothing when the user has no workspace membership', async () => {
    const { prisma, xpService, userUpdateMany, awardXp } = build({
      user: { timezone: 'UTC', workspaceMemberships: [] },
    });
    const service = new DailyLoginService(prisma, xpService);

    const awarded = await service.awardIfFirstToday('u1');

    expect(awarded).toBe(false);
    expect(userUpdateMany).not.toHaveBeenCalled();
    expect(awardXp).not.toHaveBeenCalled();
  });

  it('returns false when the user does not exist', async () => {
    const { prisma, xpService, awardXp } = build({ user: null });
    const service = new DailyLoginService(prisma, xpService);

    await expect(service.awardIfFirstToday('u1')).resolves.toBe(false);
    expect(awardXp).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- daily-login.service`
Expected: FAIL — `Cannot find module './daily-login.service'`.

- [ ] **Step 3: Implement `DailyLoginService`**

Create `apps/api/src/modules/gamification/daily-login.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { XpEvent } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { localDayInfo } from '../reminders/reminders.time';
import { XpService } from './xp.service';

/** Grants a once-per-local-day "you opened the app" XP award, scaled by the
 *  user's workspace tier. Idempotency is enforced by a state-guarded updateMany
 *  on User.lastDailyXpDate, so concurrent first-of-day requests can't double-award. */
@Injectable()
export class DailyLoginService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xpService: XpService,
  ) {}

  /** Award the daily-login XP if the user hasn't earned it yet on their local
   *  calendar day. Returns true only when this call performed the award.
   *  `now` is injectable for tests. */
  async awardIfFirstToday(userId: string, now = new Date()): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        timezone: true,
        workspaceMemberships: {
          orderBy: { joinedAt: 'asc' },
          take: 1,
          select: { workspace: { select: { tier: true } } },
        },
      },
    });
    if (!user) return false;

    const tier = user.workspaceMemberships[0]?.workspace.tier;
    if (!tier) return false;

    let today: string;
    try {
      today = localDayInfo(now, user.timezone || 'UTC').date;
    } catch {
      today = localDayInfo(now, 'UTC').date; // bad tz string -> treat as UTC
    }

    // State-guarded write: only the request that flips lastDailyXpDate to today
    // proceeds to award. Prisma's `not` filter also matches NULL rows, so a
    // brand-new user (lastDailyXpDate === null) is awarded on first activity.
    const { count } = await this.prisma.user.updateMany({
      where: { id: userId, lastDailyXpDate: { not: today } },
      data: { lastDailyXpDate: today },
    });
    if (count === 0) return false;

    await this.xpService.awardXp(userId, tier, XpEvent.DAILY_LOGIN, { date: today });
    return true;
  }
}
```

- [ ] **Step 4: Register the service in the module**

In `apps/api/src/modules/gamification/gamification.module.ts`, add `DailyLoginService` to providers and exports:

```ts
import { Module } from '@nestjs/common';
import { GamificationController } from './gamification.controller';
import { AchievementService } from './achievement.service';
import { XpService } from './xp.service';
import { DailyLoginService } from './daily-login.service';

/** XP + achievements. PrismaModule is global, so no DB import is needed.
 *  Services are exported so the streaks and auth modules can award XP. */
@Module({
  controllers: [GamificationController],
  providers: [XpService, AchievementService, DailyLoginService],
  exports: [XpService, AchievementService, DailyLoginService],
})
export class GamificationModule {}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- daily-login.service`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/gamification/daily-login.service.ts apps/api/src/modules/gamification/daily-login.service.spec.ts apps/api/src/modules/gamification/gamification.module.ts
git commit -m "feat(gamification): DailyLoginService for once-per-day tier-scaled XP"
```

---

### Task 3: Award daily-login XP from `getMe` (best-effort)

Wires the service into the app-open chokepoint. The award must never break `GET /auth/me`.

**Files:**
- Modify: `apps/api/src/modules/auth/auth.module.ts`
- Modify: `apps/api/src/modules/auth/auth.service.ts` (constructor ~46-51; `getMe` ~359-378)
- Modify: `apps/api/src/modules/auth/auth.service.spec.ts` (`buildService` helper ~67-74)

**Interfaces:**
- Consumes: `DailyLoginService.awardIfFirstToday(userId)` from the gamification module.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/modules/auth/auth.service.spec.ts`, add a daily-login mock and thread it through `buildService`. First, near the top-level mocks (after `emailMock`, ~line 20), add:

```ts
const dailyLoginMock = {
  awardIfFirstToday: jest.fn().mockResolvedValue(true),
};
```

Update `buildService` (~line 67) to pass it as the 5th constructor arg:

```ts
function buildService(prisma: PrismaMock): AuthService {
  return new AuthService(
    prisma as unknown as PrismaService,
    new JwtService({}),
    configMock,
    emailMock as unknown as EmailService,
    dailyLoginMock as unknown as import('../gamification/daily-login.service').DailyLoginService,
  );
}
```

Then add this describe block at the end of the file:

```ts
describe('AuthService.getMe daily-login XP', () => {
  const meUser = {
    id: 'u1',
    displayName: 'Aisha Bello',
    email: 'aisha@example.com',
    emailVerified: true,
    timezone: 'UTC',
    accountNumber: 'FB-1',
    preferences: {},
    currentStreak: 0,
    longestStreak: 0,
  };

  beforeEach(() => dailyLoginMock.awardIfFirstToday.mockReset().mockResolvedValue(true));

  it('awards daily-login XP for the authenticated user', async () => {
    const prisma = createPrismaMock();
    prisma.user.findUnique.mockResolvedValue(meUser);
    const service = buildService(prisma);

    await service.getMe('u1');

    expect(dailyLoginMock.awardIfFirstToday).toHaveBeenCalledWith('u1');
  });

  it('still returns the user view when the award throws', async () => {
    const prisma = createPrismaMock();
    prisma.user.findUnique.mockResolvedValue(meUser);
    dailyLoginMock.awardIfFirstToday.mockRejectedValue(new Error('xp boom'));
    const service = buildService(prisma);

    const result = await service.getMe('u1');

    expect(result.id).toBe('u1');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- auth.service`
Expected: FAIL — `AuthService` constructor takes 4 args / `dailyLogin` is undefined when `getMe` calls it (compile or runtime error).

- [ ] **Step 3: Import GamificationModule into AuthModule**

In `apps/api/src/modules/auth/auth.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { EmailModule } from '../email/email.module';
import { GamificationModule } from '../gamification/gamification.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({}), EmailModule, GamificationModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtRefreshStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

- [ ] **Step 4: Inject the service and call it from `getMe`**

In `apps/api/src/modules/auth/auth.service.ts`, add the import:

```ts
import { DailyLoginService } from '../gamification/daily-login.service';
```

Add the constructor parameter (after `email`):

```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly email: EmailService,
    private readonly dailyLogin: DailyLoginService,
  ) {}
```

In `getMe`, after the `if (!user) { throw ... }` guard and before `return this.toUserView(user)`, add the best-effort award:

```ts
    // First authenticated activity of the day earns daily-login XP. Best-effort:
    // a gamification failure must never break auth, so swallow and log.
    try {
      await this.dailyLogin.awardIfFirstToday(userId);
    } catch (err) {
      this.logger.warn(`Daily login XP failed for userId=${userId}: ${String(err)}`);
    }

    return this.toUserView(user);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- auth.service`
Expected: PASS (existing auth tests + the 2 new ones).

- [ ] **Step 6: Full verification**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS. (Run `npm run lint` from the repo root or `apps/api` per the repo's lint setup.)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/auth/auth.module.ts apps/api/src/modules/auth/auth.service.ts apps/api/src/modules/auth/auth.service.spec.ts
git commit -m "feat(auth): award daily-login XP on first app activity via getMe"
```

---

## Self-Review

**Spec coverage:**
- Trigger from `getMe()` best-effort → Task 3. ✓
- `XpEvent.DAILY_LOGIN` + `XP_BASE` (tier-scaled) → Task 1. ✓
- `User.lastDailyXpDate` + migration → Task 1. ✓
- Race-safe once-per-day guard via conditional `updateMany` → Task 2 (`awardIfFirstToday`). ✓
- Timezone resolution + UTC fallback → Task 2 (test + impl). ✓
- Independent of transaction streak (separate field/event, no streak coupling) → Task 2. ✓
- Tests for award logic + getMe best-effort → Tasks 2 & 3. ✓
- Out of scope (login streaks, achievements, backfill) → not implemented. ✓

**Type consistency:** `awardIfFirstToday(userId, now?)` defined in Task 2 and called with a single arg in Task 3 (matches the optional `now`). `awardXp(userId, tier, event, meta?)` signature matches `xp.service.ts`. `DailyLoginService` constructor `(prisma, xpService)` matches its registration and spec instantiation. `AuthService` constructor gains a 5th param consistently in impl + spec.

**Placeholder scan:** None — all steps contain concrete code and exact commands.

**Note on Prisma `not` + NULL:** Prisma's `{ not: today }` filter matches rows where the column is `NULL`, so a brand-new user (`lastDailyXpDate === null`) is correctly awarded on first activity. The unit tests exercise the count-based branching; the NULL-inclusion is Prisma runtime behavior verified by the additive migration.
