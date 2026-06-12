# Super Admin Analytics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a security-isolated super-admin dashboard (separate Next.js app + admin module in the NestJS API) showing app-wide analytics computed directly from Postgres.

**Architecture:** A new `admin` module in `apps/api` exposes admin-only endpoints under `/api/v1/admin/*`, guarded by a dedicated admin-scoped JWT strategy (separate secret + `scope: 'admin'` claim + email allowlist + TOTP). A new `apps/admin` Next.js app consumes those endpoints behind Vercel edge protection. All metrics are Prisma aggregations over Postgres, cached in Redis.

**Tech Stack:** NestJS 10, Prisma 5 (Postgres via Accelerate), ioredis, `otplib` (TOTP), Zod DTOs, Jest; Next.js 15 (App Router), React 19, Tailwind 3, Recharts, `qrcode`, Vitest.

---

## Key conventions discovered (read before starting)

- **Global prefix** is `api/v1` (`apps/api/src/main.ts`). All routes below are relative; full path = `/api/v1/<route>`.
- **Global guards** (`apps/api/src/app.module.ts`): `ThrottlerGuard` then `JwtAuthGuard` run on every route. `JwtAuthGuard` validates the *user* access token unless the route/controller is marked `@Public()`. **Admin routes MUST be `@Public()`** to bypass the user guard, then secured with `@UseGuards(AdminJwtGuard)`. `@Public()` here does NOT mean unauthenticated — `AdminJwtGuard` re-secures it.
- **DTOs** use Zod + `ZodValidationPipe` (`apps/api/src/common/pipes/zod-validation.pipe.ts`). No class-validator.
- **JWTs** are signed via `JwtService.signAsync` with explicit `secret`/`expiresIn` (see `apps/api/src/modules/auth/auth.service.ts:454`). Strategies extend `PassportStrategy(Strategy, '<name>')`.
- **Redis**: inject `RedisService`; the raw ioredis client is `redis.client` (`apps/api/src/redis/redis.service.ts:11`). Use `client.get` / `client.set(key, val, 'EX', seconds)`.
- **Env**: add new vars to `apps/api/src/config/env.schema.ts` (Zod). Access via `ConfigService<Env, true>.get('NAME', { infer: true })`.
- **Prices**: `TIER_PRICING` in `packages/shared/src/constants.ts` — `{ amountMinor, currency:'USD', interval:'month' }` for PRO(499)/PREMIUM(999)/FAMILY(1499). All monthly, so MRR = simple sum of cents.
- **Active-user definition (deviation from spec, intentional):** `ConversationMessage` has NO direct `userId` column — only `conversationId`. To keep per-user active counts correctly attributed, "active" = a user with `lastLoginAt` in window **OR** a `Transaction` they logged (`Transaction.loggedByUserId` + `createdAt`) in window. Chat is reported separately as raw volume (message/conversation counts), not folded into active-user counts.
- **Live schema** is `apps/api/prisma/schema.prisma` (NOT the root `finby-schema.prisma`, which lags).

---

## File structure

**API (`apps/api/src/modules/admin/`):**
- `admin.module.ts` — wires controllers, services, the admin JWT strategy/guard.
- `admin-auth.service.ts` — password+allowlist+TOTP verification, issues admin token.
- `admin-auth.controller.ts` — `POST /admin/auth/login`, `POST /admin/auth/totp/enroll`.
- `admin-analytics.service.ts` — Prisma aggregations + Redis cache for the 4 metric groups.
- `admin-analytics.controller.ts` — `GET /admin/metrics/{growth,engagement,revenue,ops}`.
- `admin.types.ts` — result/payload interfaces.
- `admin.allowlist.ts` — parse + membership check for `ADMIN_EMAILS`.
- `strategies/admin-jwt.strategy.ts` — passport `'admin-jwt'`, validates secret + scope + allowlist.
- `guards/admin-jwt.guard.ts` — `AuthGuard('admin-jwt')`.
- `dto/admin.schemas.ts` — Zod schemas for login / totp / date-range query.
- `*.spec.ts` — unit tests per service/guard.

**Prisma:** new model `AdminTotpSecret` in `apps/api/prisma/schema.prisma` + migration.

**Shared:** add admin metric result types to `packages/shared/src/` (so the admin app imports them).

**Admin app (`apps/admin/`):** standard Next.js 15 App Router app mirroring `apps/web` config.

---

## PHASE A — API: admin authentication

### Task A1: Add env vars + AdminTotpSecret model + migration

**Files:**
- Modify: `apps/api/src/config/env.schema.ts`
- Modify: `apps/api/prisma/schema.prisma`
- Create: migration via prisma CLI

- [ ] **Step 1: Add admin env vars to the Zod schema**

In `apps/api/src/config/env.schema.ts`, inside the `z.object({...})` (after the JWT block, before LLM), add:

```typescript
  // Admin dashboard (super-admin analytics). Optional so the API boots without it;
  // admin routes return 401 until ADMIN_EMAILS + ADMIN_JWT_SECRET are set.
  ADMIN_EMAILS: z.string().default(''), // comma-separated allowlist, lowercased at use
  ADMIN_JWT_SECRET: z.string().min(16).optional(),
  ADMIN_JWT_TTL: z.string().default('8h'), // one workday session; re-login (with TOTP) after.
  ADMIN_TOTP_ISSUER: z.string().default('Finby Admin'),
```

- [ ] **Step 2: Add the AdminTotpSecret model**

Append to `apps/api/prisma/schema.prisma`:

```prisma
// ============================================================
// ADMIN TOTP SECRETS
// Second-factor material for super-admins. A row here does NOT grant admin
// access — the ADMIN_EMAILS allowlist (a deploy-time secret) does. This only
// stores the enrolled TOTP secret, keyed by the admin's lowercased email.
// ============================================================

model AdminTotpSecret {
  email      String   @id // lowercased admin email
  secret     String   // base32 TOTP secret
  enrolledAt DateTime @default(now())

  @@map("admin_totp_secrets")
}
```

- [ ] **Step 3: Create the migration**

Run: `pnpm --filter finby-api prisma:migrate -- --name admin_totp_secret`
Expected: a new folder under `apps/api/prisma/migrations/` and `prisma generate` runs. If the dev DB isn't up, run `pnpm db:up` first.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/config/env.schema.ts apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): admin env vars + AdminTotpSecret model"
```

---

### Task A2: Email allowlist helper (TDD)

**Files:**
- Create: `apps/api/src/modules/admin/admin.allowlist.ts`
- Test: `apps/api/src/modules/admin/admin.allowlist.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/modules/admin/admin.allowlist.spec.ts
import { parseAllowlist, isAllowedAdmin } from './admin.allowlist';

describe('admin allowlist', () => {
  it('parses comma-separated emails, trims, lowercases, drops blanks', () => {
    expect(parseAllowlist(' A@x.com, b@Y.com ,, ')).toEqual(['a@x.com', 'b@y.com']);
  });

  it('returns empty array for empty/undefined input', () => {
    expect(parseAllowlist('')).toEqual([]);
    expect(parseAllowlist(undefined)).toEqual([]);
  });

  it('membership is case-insensitive', () => {
    expect(isAllowedAdmin('A@X.com', ['a@x.com'])).toBe(true);
    expect(isAllowedAdmin('nope@x.com', ['a@x.com'])).toBe(false);
  });

  it('never allows when the list is empty', () => {
    expect(isAllowedAdmin('a@x.com', [])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-api test -- admin.allowlist`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// apps/api/src/modules/admin/admin.allowlist.ts
/** Parse the ADMIN_EMAILS env string into a normalized list. */
export function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

/** Case-insensitive membership check. Empty allowlist denies everyone. */
export function isAllowedAdmin(email: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return false;
  return allowlist.includes(email.trim().toLowerCase());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-api test -- admin.allowlist`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/admin.allowlist.ts apps/api/src/modules/admin/admin.allowlist.spec.ts
git commit -m "feat(api): admin email allowlist helper"
```

---

### Task A3: Admin JWT strategy + guard

**Files:**
- Create: `apps/api/src/modules/admin/admin.types.ts`
- Create: `apps/api/src/modules/admin/strategies/admin-jwt.strategy.ts`
- Create: `apps/api/src/modules/admin/guards/admin-jwt.guard.ts`
- Test: `apps/api/src/modules/admin/strategies/admin-jwt.strategy.spec.ts`

- [ ] **Step 1: Define admin token payload + request-user types**

```typescript
// apps/api/src/modules/admin/admin.types.ts
/** Payload carried by the admin-scoped JWT. */
export interface AdminTokenPayload {
  sub: string;   // user id
  email: string;
  scope: 'admin';
}

/** Shape attached to req.user by AdminJwtStrategy. */
export interface AdminUser {
  userId: string;
  email: string;
}
```

- [ ] **Step 2: Write the failing strategy test**

```typescript
// apps/api/src/modules/admin/strategies/admin-jwt.strategy.spec.ts
import { UnauthorizedException } from '@nestjs/common';
import { AdminJwtStrategy } from './admin-jwt.strategy';

function makeStrategy(allowlist: string): AdminJwtStrategy {
  const config = {
    get: (k: string) =>
      k === 'ADMIN_JWT_SECRET' ? 'test-admin-secret-0123456789' : allowlist,
  } as never;
  return new AdminJwtStrategy(config);
}

describe('AdminJwtStrategy.validate', () => {
  it('accepts an admin-scoped, allowlisted token', () => {
    const s = makeStrategy('a@x.com');
    expect(s.validate({ sub: 'u1', email: 'a@x.com', scope: 'admin' })).toEqual({
      userId: 'u1',
      email: 'a@x.com',
    });
  });

  it('rejects when scope is not admin', () => {
    const s = makeStrategy('a@x.com');
    expect(() => s.validate({ sub: 'u1', email: 'a@x.com', scope: 'user' as never })).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects when email left the allowlist', () => {
    const s = makeStrategy('other@x.com');
    expect(() => s.validate({ sub: 'u1', email: 'a@x.com', scope: 'admin' })).toThrow(
      UnauthorizedException,
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter finby-api test -- admin-jwt.strategy`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the strategy**

```typescript
// apps/api/src/modules/admin/strategies/admin-jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Env } from '../../../config/env.schema';
import { isAllowedAdmin, parseAllowlist } from '../admin.allowlist';
import type { AdminTokenPayload, AdminUser } from '../admin.types';

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(private readonly config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Falls back to a random-ish constant when unset so the strategy still
      // constructs; tokens can never be minted without the real secret anyway.
      secretOrKey: config.get('ADMIN_JWT_SECRET', { infer: true }) ?? 'admin-secret-unset',
    });
  }

  /** Runs on every admin request: enforces scope + re-checks the allowlist live. */
  validate(payload: AdminTokenPayload): AdminUser {
    if (payload.scope !== 'admin') {
      throw new UnauthorizedException();
    }
    const allowlist = parseAllowlist(this.config.get('ADMIN_EMAILS', { infer: true }));
    if (!isAllowedAdmin(payload.email, allowlist)) {
      throw new UnauthorizedException();
    }
    return { userId: payload.sub, email: payload.email };
  }
}
```

- [ ] **Step 5: Implement the guard**

```typescript
// apps/api/src/modules/admin/guards/admin-jwt.guard.ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Secures admin routes. Apply alongside @Public() so the global user
 *  JwtAuthGuard is bypassed and only admin-scoped tokens are accepted. */
@Injectable()
export class AdminJwtGuard extends AuthGuard('admin-jwt') {}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter finby-api test -- admin-jwt.strategy`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/admin/admin.types.ts apps/api/src/modules/admin/strategies apps/api/src/modules/admin/guards
git commit -m "feat(api): admin JWT strategy + guard (scope + allowlist)"
```

---

### Task A4: Admin auth DTO schemas

**Files:**
- Create: `apps/api/src/modules/admin/dto/admin.schemas.ts`

- [ ] **Step 1: Implement the schemas**

```typescript
// apps/api/src/modules/admin/dto/admin.schemas.ts
import { z } from 'zod';

export const adminLoginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1),
  totp: z.string().trim().regex(/^\d{6}$/).optional(), // omitted only on first-login enrollment
});
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

export const adminEnrollSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1),
});
export type AdminEnrollInput = z.infer<typeof adminEnrollSchema>;

// Shared date-range query for metric endpoints. Defaults to last 30 days when omitted.
export const metricRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type MetricRangeQuery = z.infer<typeof metricRangeSchema>;
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/admin/dto/admin.schemas.ts
git commit -m "feat(api): admin auth + metric-range DTO schemas"
```

---

### Task A5: Admin auth service (TDD)

**Files:**
- Create: `apps/api/src/modules/admin/admin-auth.service.ts`
- Test: `apps/api/src/modules/admin/admin-auth.service.spec.ts`
- Add dep: `otplib`

- [ ] **Step 1: Install otplib**

Run: `pnpm --filter finby-api add otplib`
Expected: `otplib` appears in `apps/api/package.json` dependencies.

- [ ] **Step 2: Write the failing test**

```typescript
// apps/api/src/modules/admin/admin-auth.service.spec.ts
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import { AdminAuthService } from './admin-auth.service';

function makeService(opts: {
  allowlist?: string;
  user?: { id: string; email: string; passwordHash: string } | null;
  totpRow?: { email: string; secret: string } | null;
}) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(opts.user ?? null) },
    adminTotpSecret: {
      findUnique: jest.fn().mockResolvedValue(opts.totpRow ?? null),
      create: jest.fn().mockResolvedValue({}),
    },
  } as never;
  const config = {
    get: (k: string) => {
      if (k === 'ADMIN_EMAILS') return opts.allowlist ?? 'admin@x.com';
      if (k === 'ADMIN_JWT_SECRET') return 'test-admin-secret-0123456789';
      if (k === 'ADMIN_JWT_TTL') return '8h';
      if (k === 'ADMIN_TOTP_ISSUER') return 'Finby Admin';
      return undefined;
    },
  } as never;
  const jwt = { signAsync: jest.fn().mockResolvedValue('signed.admin.token') } as never;
  return new AdminAuthService(prisma, config, jwt);
}

describe('AdminAuthService.login', () => {
  const hash = bcrypt.hashSync('correct-horse', 10);
  const user = { id: 'u1', email: 'admin@x.com', passwordHash: hash };

  it('rejects a non-allowlisted email with 401', async () => {
    const svc = makeService({ allowlist: 'someone@else.com', user });
    await expect(
      svc.login({ email: 'admin@x.com', password: 'correct-horse', totp: '000000' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a wrong password with 401', async () => {
    const svc = makeService({ user });
    await expect(
      svc.login({ email: 'admin@x.com', password: 'wrong', totp: '000000' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a bad TOTP code with 401', async () => {
    const secret = authenticator.generateSecret();
    const svc = makeService({ user, totpRow: { email: 'admin@x.com', secret } });
    await expect(
      svc.login({ email: 'admin@x.com', password: 'correct-horse', totp: '123456' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('issues an admin token on password + allowlist + valid TOTP', async () => {
    const secret = authenticator.generateSecret();
    const code = authenticator.generate(secret);
    const svc = makeService({ user, totpRow: { email: 'admin@x.com', secret } });
    const res = await svc.login({ email: 'admin@x.com', password: 'correct-horse', totp: code });
    expect(res.accessToken).toBe('signed.admin.token');
  });
});

describe('AdminAuthService.enroll', () => {
  const hash = bcrypt.hashSync('correct-horse', 10);
  const user = { id: 'u1', email: 'admin@x.com', passwordHash: hash };

  it('returns an otpauth URI for an allowlisted admin with no existing secret', async () => {
    const svc = makeService({ user, totpRow: null });
    const res = await svc.enroll({ email: 'admin@x.com', password: 'correct-horse' });
    expect(res.otpauthUrl).toContain('otpauth://totp/');
  });

  it('refuses enrollment for a non-allowlisted email', async () => {
    const svc = makeService({ allowlist: 'other@x.com', user, totpRow: null });
    await expect(
      svc.enroll({ email: 'admin@x.com', password: 'correct-horse' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter finby-api test -- admin-auth.service`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the service**

```typescript
// apps/api/src/modules/admin/admin-auth.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import { PrismaService } from '../../prisma/prisma.service';
import type { Env } from '../../config/env.schema';
import { isAllowedAdmin, parseAllowlist } from './admin.allowlist';
import type { AdminTokenPayload } from './admin.types';
import type { AdminEnrollInput, AdminLoginInput } from './dto/admin.schemas';

export interface AdminLoginResult {
  accessToken: string;
  email: string;
}

export interface AdminEnrollResult {
  otpauthUrl: string;
  secret: string; // shown once so the admin can also enter it manually
}

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly jwt: JwtService,
  ) {}

  /** Generic 401 — never reveal which factor failed. */
  private deny(): never {
    throw new UnauthorizedException('Invalid admin credentials');
  }

  private allowlist(): string[] {
    return parseAllowlist(this.config.get('ADMIN_EMAILS', { infer: true }));
  }

  /** Verify email∈allowlist + password. Returns the user or denies. */
  private async verifyPasswordAndAllowlist(email: string, password: string) {
    if (!isAllowedAdmin(email, this.allowlist())) this.deny();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true },
    });
    if (!user) this.deny();
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) this.deny();
    return user;
  }

  async login(input: AdminLoginInput): Promise<AdminLoginResult> {
    const user = await this.verifyPasswordAndAllowlist(input.email, input.password);
    const totpRow = await this.prisma.adminTotpSecret.findUnique({ where: { email: input.email } });
    if (!totpRow) {
      // Not enrolled yet — force enrollment first.
      throw new UnauthorizedException('TOTP enrollment required');
    }
    if (!input.totp || !authenticator.check(input.totp, totpRow.secret)) this.deny();

    const payload: AdminTokenPayload = { sub: user.id, email: user.email, scope: 'admin' };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get('ADMIN_JWT_SECRET', { infer: true }),
      expiresIn: this.config.get('ADMIN_JWT_TTL', { infer: true }),
    });
    return { accessToken, email: user.email };
  }

  async enroll(input: AdminEnrollInput): Promise<AdminEnrollResult> {
    const user = await this.verifyPasswordAndAllowlist(input.email, input.password);
    const existing = await this.prisma.adminTotpSecret.findUnique({ where: { email: input.email } });
    if (existing) {
      // Already enrolled — don't allow silent re-enrollment (would lock out the real admin).
      throw new UnauthorizedException('TOTP already enrolled');
    }
    const secret = authenticator.generateSecret();
    await this.prisma.adminTotpSecret.create({ data: { email: input.email, secret } });
    const issuer = this.config.get('ADMIN_TOTP_ISSUER', { infer: true });
    const otpauthUrl = authenticator.keyuri(user.email, issuer, secret);
    return { otpauthUrl, secret };
  }
}
```

> Note: the login test for the not-enrolled path is covered by `enroll`; the four `login` tests above all pass a `totpRow`, so `signAsync` is reached only on the happy path. The "TOTP enrollment required" branch is exercised in Task A6's controller test.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter finby-api test -- admin-auth.service`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/admin/admin-auth.service.ts apps/api/src/modules/admin/admin-auth.service.spec.ts apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): admin auth service (password + allowlist + TOTP)"
```

---

### Task A6: Admin auth controller

**Files:**
- Create: `apps/api/src/modules/admin/admin-auth.controller.ts`

- [ ] **Step 1: Implement the controller**

```typescript
// apps/api/src/modules/admin/admin-auth.controller.ts
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminAuthService, type AdminEnrollResult, type AdminLoginResult } from './admin-auth.service';
import {
  adminEnrollSchema,
  adminLoginSchema,
  type AdminEnrollInput,
  type AdminLoginInput,
} from './dto/admin.schemas';

// @Public() bypasses the global user JwtAuthGuard. Brute-force throttled hard:
// 5 attempts / 15 min per IP (matches the sensitivity of an admin login).
@Public()
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Throttle({ global: { limit: 5, ttl: 900_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body(new ZodValidationPipe(adminLoginSchema)) body: AdminLoginInput): Promise<AdminLoginResult> {
    return this.auth.login(body);
  }

  @Throttle({ global: { limit: 5, ttl: 900_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('totp/enroll')
  enroll(@Body(new ZodValidationPipe(adminEnrollSchema)) body: AdminEnrollInput): Promise<AdminEnrollResult> {
    return this.auth.enroll(body);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/admin/admin-auth.controller.ts
git commit -m "feat(api): admin auth controller (login + TOTP enroll)"
```

---

## PHASE B — API: admin analytics

### Task B1: Admin metric result types (shared)

**Files:**
- Create: `packages/shared/src/admin-metrics.ts`
- Modify: `packages/shared/src/index.ts` (export the new module)

- [ ] **Step 1: Define the result types**

```typescript
// packages/shared/src/admin-metrics.ts
export interface TimeSeriesPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface GrowthMetrics {
  totalUsers: number;
  totalWorkspaces: number;
  signups: TimeSeriesPoint[]; // daily new users in range
  dau: number;
  wau: number;
  mau: number;
  activeLast7Pct: number;  // % of all users active in last 7 days
  activeLast30Pct: number;
  tierSplit: { free: number; paid: number };
}

export interface EngagementMetrics {
  totalTransactions: number;
  transactionsPerDay: TimeSeriesPoint[];
  avgTransactionsPerActiveUser: number;
  conversations: number;
  chatMessages: number;
  streakDistribution: { bucket: string; users: number }[]; // e.g. "0","1-6","7-29","30+"
  featureAdoption: { budgets: number; portfolio: number; alerts: number }; // % of workspaces
}

export interface RevenueMetrics {
  mrrMinor: number;           // monthly recurring revenue in USD cents
  currency: 'USD';
  paidByTier: { tier: string; count: number }[];
  paidByProvider: { provider: string; count: number }[];
  statusBreakdown: { status: string; count: number }[];
  trials: number;
  newPaidPerDay: TimeSeriesPoint[];
  churnPerDay: TimeSeriesPoint[];
}

export interface OpsMetrics {
  feedbackTotal: number;
  feedbackAvgRating: number | null;
  recentFeedback: { rating: number; comment: string | null; createdAt: string }[];
  pastDueSubscriptions: number;
  sentryUrl: string | null; // link-out; null when unset
}
```

- [ ] **Step 2: Export from the shared index**

In `packages/shared/src/index.ts`, add (match the existing `export *` style in that file):

```typescript
export * from './admin-metrics';
```

- [ ] **Step 3: Build shared to verify types compile**

Run: `pnpm --filter @finby/shared build`
Expected: build succeeds (or `pnpm --filter @finby/shared typecheck` if no build script — check the package's scripts first).

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/admin-metrics.ts packages/shared/src/index.ts
git commit -m "feat(shared): admin metric result types"
```

---

### Task B2: Admin analytics service — growth metrics (TDD)

**Files:**
- Create: `apps/api/src/modules/admin/admin-analytics.service.ts`
- Test: `apps/api/src/modules/admin/admin-analytics.service.spec.ts`

- [ ] **Step 1: Write the failing test (growth)**

```typescript
// apps/api/src/modules/admin/admin-analytics.service.spec.ts
import { AdminAnalyticsService } from './admin-analytics.service';

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    user: { count: jest.fn().mockResolvedValue(100), findMany: jest.fn().mockResolvedValue([]) },
    workspace: { count: jest.fn().mockResolvedValue(80) },
    transaction: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    subscription: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]) },
    feedback: { count: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue({ _avg: { rating: null } }), findMany: jest.fn().mockResolvedValue([]) },
    budget: { findMany: jest.fn().mockResolvedValue([]) },
    portfolioHolding: { findMany: jest.fn().mockResolvedValue([]) },
    alert: { findMany: jest.fn().mockResolvedValue([]) },
    conversation: { count: jest.fn().mockResolvedValue(0) },
    conversationMessage: { count: jest.fn().mockResolvedValue(0) },
    $queryRaw: jest.fn().mockResolvedValue([]),
    ...prismaOverrides,
  } as never;
  // Redis cache that always misses then stores.
  const redis = { client: { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK') } } as never;
  const config = { get: () => undefined } as never;
  return { svc: new AdminAnalyticsService(prisma, redis, config), prisma };
}

describe('AdminAnalyticsService.growth', () => {
  it('computes totals, tier split, and active-user unions', async () => {
    const { svc, prisma } = makeService();
    // 100 total users; tier split: 60 free workspaces, 20 paid
    (prisma.workspace.count as jest.Mock)
      .mockResolvedValueOnce(80) // total
      .mockResolvedValueOnce(20); // paid (tier != FREE)
    // active = union of login-recent users and txn-logging users
    (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]); // recent logins
    (prisma.transaction.findMany as jest.Mock).mockResolvedValue([{ loggedByUserId: 'u2' }, { loggedByUserId: 'u3' }]);
    // signups raw series
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ date: '2026-06-10', value: 3n }]);

    const res = await svc.growth({});
    expect(res.totalUsers).toBe(100);
    expect(res.totalWorkspaces).toBe(80);
    expect(res.tierSplit).toEqual({ free: 60, paid: 20 });
    // union of {u1,u2} and {u2,u3} = 3 distinct
    expect(res.dau).toBe(3);
    expect(res.signups).toEqual([{ date: '2026-06-10', value: 3 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-api test -- admin-analytics.service`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service shell + growth method**

```typescript
// apps/api/src/modules/admin/admin-analytics.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type {
  GrowthMetrics,
  TimeSeriesPoint,
} from '@finby/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import type { Env } from '../../config/env.schema';
import type { MetricRangeQuery } from './dto/admin.schemas';

const CACHE_TTL_SECONDS = 600; // 10 min

@Injectable()
export class AdminAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Resolve a range to concrete [from, to]; defaults to last 30 days. */
  private resolveRange(q: MetricRangeQuery): { from: Date; to: Date } {
    const to = q.to ?? new Date();
    const from = q.from ?? new Date(to.getTime() - 30 * 86_400_000);
    return { from, to };
  }

  /** Read-through Redis cache keyed by metric name + range. */
  private async cached<T>(key: string, compute: () => Promise<T>): Promise<T> {
    const hit = await this.redis.client.get(key);
    if (hit) return JSON.parse(hit) as T;
    const fresh = await compute();
    await this.redis.client.set(key, JSON.stringify(fresh), 'EX', CACHE_TTL_SECONDS);
    return fresh;
  }

  private rangeKey(name: string, from: Date, to: Date): string {
    return `admin:metrics:${name}:${from.toISOString()}:${to.toISOString()}`;
  }

  /** Daily-bucketed count time series via raw SQL (date_trunc). */
  private async dailySeries(
    table: 'users' | 'transactions',
    dateColumn: string,
    from: Date,
    to: Date,
  ): Promise<TimeSeriesPoint[]> {
    const rows = await this.prisma.$queryRaw<{ date: string; value: bigint }[]>(Prisma.sql`
      SELECT to_char(date_trunc('day', ${Prisma.raw(`"${dateColumn}"`)}), 'YYYY-MM-DD') AS date,
             count(*)::bigint AS value
      FROM ${Prisma.raw(`"${table}"`)}
      WHERE ${Prisma.raw(`"${dateColumn}"`)} >= ${from} AND ${Prisma.raw(`"${dateColumn}"`)} <= ${to}
      GROUP BY 1
      ORDER BY 1
    `);
    return rows.map((r) => ({ date: r.date, value: Number(r.value) }));
  }

  /** Distinct count of users active (login OR logged a transaction) since cutoff. */
  private async activeUserCount(cutoff: Date): Promise<number> {
    const [loginUsers, txnUsers] = await Promise.all([
      this.prisma.user.findMany({ where: { lastLoginAt: { gte: cutoff } }, select: { id: true } }),
      this.prisma.transaction.findMany({
        where: { createdAt: { gte: cutoff } },
        distinct: ['loggedByUserId'],
        select: { loggedByUserId: true },
      }),
    ]);
    const set = new Set<string>();
    for (const u of loginUsers) set.add(u.id);
    for (const t of txnUsers) set.add(t.loggedByUserId);
    return set.size;
  }

  async growth(q: MetricRangeQuery): Promise<GrowthMetrics> {
    const { from, to } = this.resolveRange(q);
    return this.cached(this.rangeKey('growth', from, to), async () => {
      const now = new Date();
      const day = (n: number) => new Date(now.getTime() - n * 86_400_000);
      const [totalUsers, totalWorkspaces, paidWorkspaces, signups, dau, wau, mau, active7, active30] =
        await Promise.all([
          this.prisma.user.count(),
          this.prisma.workspace.count(),
          this.prisma.workspace.count({ where: { tier: { not: 'FREE' } } }),
          this.dailySeries('users', 'createdAt', from, to),
          this.activeUserCount(day(1)),
          this.activeUserCount(day(7)),
          this.activeUserCount(day(30)),
          this.activeUserCount(day(7)),
          this.activeUserCount(day(30)),
        ]);
      const pct = (n: number) => (totalUsers === 0 ? 0 : Math.round((n / totalUsers) * 1000) / 10);
      return {
        totalUsers,
        totalWorkspaces,
        signups,
        dau,
        wau,
        mau,
        activeLast7Pct: pct(active7),
        activeLast30Pct: pct(active30),
        tierSplit: { free: totalWorkspaces - paidWorkspaces, paid: paidWorkspaces },
      };
    });
  }
}
```

> The test injects a Redis stub whose `get` returns null, so `cached` always recomputes. `Prisma.sql`/`Prisma.raw` are mocked away because `$queryRaw` itself is stubbed.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-api test -- admin-analytics.service`
Expected: PASS (growth test).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/admin-analytics.service.ts apps/api/src/modules/admin/admin-analytics.service.spec.ts
git commit -m "feat(api): admin analytics service — growth metrics"
```

---

### Task B3: Admin analytics service — engagement metrics (TDD)

**Files:**
- Modify: `apps/api/src/modules/admin/admin-analytics.service.ts`
- Modify: `apps/api/src/modules/admin/admin-analytics.service.spec.ts`

- [ ] **Step 1: Add the failing engagement test**

Append to the spec file:

```typescript
describe('AdminAnalyticsService.engagement', () => {
  it('computes totals, chat counts, and feature adoption %', async () => {
    const { svc, prisma } = makeService();
    (prisma.transaction.count as jest.Mock).mockResolvedValue(500);
    (prisma.conversation.count as jest.Mock).mockResolvedValue(40);
    (prisma.conversationMessage.count as jest.Mock).mockResolvedValue(900);
    (prisma.workspace.count as jest.Mock).mockResolvedValue(100); // total workspaces
    // distinct workspaces using each feature
    (prisma.budget.findMany as jest.Mock).mockResolvedValue([{ workspaceId: 'w1' }, { workspaceId: 'w2' }]);
    (prisma.portfolioHolding.findMany as jest.Mock).mockResolvedValue([{ workspaceId: 'w1' }]);
    (prisma.alert.findMany as jest.Mock).mockResolvedValue([]);
    // streak buckets from raw users
    (prisma.user.findMany as jest.Mock).mockResolvedValue([
      { currentStreak: 0 }, { currentStreak: 3 }, { currentStreak: 10 }, { currentStreak: 40 },
    ]);
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

    const res = await svc.engagement({});
    expect(res.totalTransactions).toBe(500);
    expect(res.conversations).toBe(40);
    expect(res.chatMessages).toBe(900);
    expect(res.featureAdoption).toEqual({ budgets: 2, portfolio: 1, alerts: 0 });
    expect(res.streakDistribution).toEqual([
      { bucket: '0', users: 1 },
      { bucket: '1-6', users: 1 },
      { bucket: '7-29', users: 1 },
      { bucket: '30+', users: 1 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-api test -- admin-analytics.service`
Expected: FAIL — `svc.engagement is not a function`.

- [ ] **Step 3: Implement engagement**

Add these imports at the top of `admin-analytics.service.ts` (extend the `@finby/shared` import):

```typescript
import type {
  EngagementMetrics,
  GrowthMetrics,
  TimeSeriesPoint,
} from '@finby/shared';
```

Add the method to the class:

```typescript
  private bucketStreak(streak: number): '0' | '1-6' | '7-29' | '30+' {
    if (streak <= 0) return '0';
    if (streak < 7) return '1-6';
    if (streak < 30) return '7-29';
    return '30+';
  }

  /** Count distinct workspaceIds that have ≥1 row in a feature table. */
  private async distinctWorkspaces(
    rows: Promise<{ workspaceId: string }[]>,
  ): Promise<number> {
    const set = new Set((await rows).map((r) => r.workspaceId));
    return set.size;
  }

  async engagement(q: MetricRangeQuery): Promise<EngagementMetrics> {
    const { from, to } = this.resolveRange(q);
    return this.cached(this.rangeKey('engagement', from, to), async () => {
      const now = new Date();
      const [totalTransactions, transactionsPerDay, conversations, chatMessages, users, budgets, portfolio, alerts, mau] =
        await Promise.all([
          this.prisma.transaction.count(),
          this.dailySeries('transactions', 'createdAt', from, to),
          this.prisma.conversation.count(),
          this.prisma.conversationMessage.count(),
          this.prisma.user.findMany({ select: { currentStreak: true } }),
          this.distinctWorkspaces(
            this.prisma.budget.findMany({ distinct: ['workspaceId'], select: { workspaceId: true } }),
          ),
          this.distinctWorkspaces(
            this.prisma.portfolioHolding.findMany({ distinct: ['workspaceId'], select: { workspaceId: true } }),
          ),
          this.distinctWorkspaces(
            this.prisma.alert.findMany({ distinct: ['workspaceId'], select: { workspaceId: true } }),
          ),
          this.activeUserCount(new Date(now.getTime() - 30 * 86_400_000)),
        ]);

      const buckets: Record<'0' | '1-6' | '7-29' | '30+', number> = { '0': 0, '1-6': 0, '7-29': 0, '30+': 0 };
      for (const u of users) buckets[this.bucketStreak(u.currentStreak)] += 1;

      return {
        totalTransactions,
        transactionsPerDay,
        avgTransactionsPerActiveUser: mau === 0 ? 0 : Math.round((totalTransactions / mau) * 10) / 10,
        conversations,
        chatMessages,
        streakDistribution: (['0', '1-6', '7-29', '30+'] as const).map((b) => ({ bucket: b, users: buckets[b] })),
        featureAdoption: { budgets, portfolio, alerts },
      };
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-api test -- admin-analytics.service`
Expected: PASS (growth + engagement).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/admin-analytics.service.ts apps/api/src/modules/admin/admin-analytics.service.spec.ts
git commit -m "feat(api): admin analytics service — engagement metrics"
```

---

### Task B4: Admin analytics service — revenue metrics (TDD)

**Files:**
- Modify: `apps/api/src/modules/admin/admin-analytics.service.ts`
- Modify: `apps/api/src/modules/admin/admin-analytics.service.spec.ts`

- [ ] **Step 1: Add the failing revenue test**

```typescript
describe('AdminAnalyticsService.revenue', () => {
  it('computes MRR from active paid subs and breaks down by tier/provider/status', async () => {
    const { svc, prisma } = makeService();
    // groupBy is called 3×: by tier (active paid), by provider, by status.
    (prisma.subscription.groupBy as jest.Mock)
      .mockResolvedValueOnce([
        { tier: 'PRO', _count: { _all: 2 } },     // 2 × 499
        { tier: 'PREMIUM', _count: { _all: 1 } },  // 1 × 999
      ])
      .mockResolvedValueOnce([
        { billingProvider: 'STRIPE', _count: { _all: 2 } },
        { billingProvider: 'PAYSTACK', _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        { status: 'ACTIVE', _count: { _all: 3 } },
        { status: 'PAST_DUE', _count: { _all: 1 } },
      ]);
    (prisma.subscription.count as jest.Mock).mockResolvedValue(0); // trials
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]); // new/churn series

    const res = await svc.revenue({});
    expect(res.mrrMinor).toBe(2 * 499 + 1 * 999); // 1997
    expect(res.currency).toBe('USD');
    expect(res.paidByTier).toEqual([
      { tier: 'PRO', count: 2 },
      { tier: 'PREMIUM', count: 1 },
    ]);
    expect(res.statusBreakdown).toContainEqual({ status: 'PAST_DUE', count: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-api test -- admin-analytics.service`
Expected: FAIL — `svc.revenue is not a function`.

- [ ] **Step 3: Implement revenue**

Extend the `@finby/shared` import to add `RevenueMetrics`, and add this import near the top:

```typescript
import { TIER_PRICING, type SubscriptionTier } from '@finby/shared';
```

Add the method:

```typescript
  async revenue(q: MetricRangeQuery): Promise<RevenueMetrics> {
    const { from, to } = this.resolveRange(q);
    return this.cached(this.rangeKey('revenue', from, to), async () => {
      const activePaid = { status: 'ACTIVE' as const, tier: { not: 'FREE' as const } };
      const [byTier, byProvider, byStatus, trials, newPaidPerDay, churnPerDay] = await Promise.all([
        this.prisma.subscription.groupBy({ by: ['tier'], where: activePaid, _count: { _all: true } }),
        this.prisma.subscription.groupBy({ by: ['billingProvider'], where: activePaid, _count: { _all: true } }),
        this.prisma.subscription.groupBy({ by: ['status'], _count: { _all: true } }),
        this.prisma.subscription.count({ where: { status: 'TRIALING' } }),
        this.subscriptionSeries('createdAt', from, to, true),
        this.subscriptionSeries('canceledAt', from, to, false),
      ]);

      let mrrMinor = 0;
      const paidByTier = byTier.map((g) => {
        const tier = g.tier as Exclude<SubscriptionTier, 'FREE'>;
        const count = g._count._all;
        const price = TIER_PRICING[tier];
        if (price) mrrMinor += price.amountMinor * count; // all monthly
        return { tier: g.tier, count };
      });

      return {
        mrrMinor,
        currency: 'USD' as const,
        paidByTier,
        paidByProvider: byProvider.map((g) => ({ provider: g.billingProvider, count: g._count._all })),
        statusBreakdown: byStatus.map((g) => ({ status: g.status, count: g._count._all })),
        trials,
        newPaidPerDay,
        churnPerDay,
      };
    });
  }

  /** Daily count of subscriptions by a date column (paid-only for new, any for churn). */
  private async subscriptionSeries(
    dateColumn: 'createdAt' | 'canceledAt',
    from: Date,
    to: Date,
    paidOnly: boolean,
  ): Promise<TimeSeriesPoint[]> {
    const col = dateColumn === 'createdAt' ? '"createdAt"' : '"canceledAt"';
    const tierFilter = paidOnly ? Prisma.sql`AND "tier" <> 'FREE'` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<{ date: string; value: bigint }[]>(Prisma.sql`
      SELECT to_char(date_trunc('day', ${Prisma.raw(col)}), 'YYYY-MM-DD') AS date,
             count(*)::bigint AS value
      FROM "subscriptions"
      WHERE ${Prisma.raw(col)} >= ${from} AND ${Prisma.raw(col)} <= ${to} ${tierFilter}
      GROUP BY 1
      ORDER BY 1
    `);
    return rows.map((r) => ({ date: r.date, value: Number(r.value) }));
  }
```

Add `RevenueMetrics` to the `import type { ... } from '@finby/shared'` list.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-api test -- admin-analytics.service`
Expected: PASS (growth + engagement + revenue).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/admin-analytics.service.ts apps/api/src/modules/admin/admin-analytics.service.spec.ts
git commit -m "feat(api): admin analytics service — revenue metrics + MRR"
```

---

### Task B5: Admin analytics service — ops metrics (TDD)

**Files:**
- Modify: `apps/api/src/modules/admin/admin-analytics.service.ts`
- Modify: `apps/api/src/modules/admin/admin-analytics.service.spec.ts`

- [ ] **Step 1: Add the failing ops test**

```typescript
describe('AdminAnalyticsService.ops', () => {
  it('aggregates feedback, past-due count, and the Sentry link-out', async () => {
    const { svc, prisma } = makeService({}); // default config.get returns undefined → sentryUrl null
    (prisma.feedback.count as jest.Mock).mockResolvedValue(12);
    (prisma.feedback.aggregate as jest.Mock).mockResolvedValue({ _avg: { rating: 4.25 } });
    (prisma.feedback.findMany as jest.Mock).mockResolvedValue([
      { rating: 5, comment: 'great', createdAt: new Date('2026-06-11T00:00:00Z') },
    ]);
    (prisma.subscription.count as jest.Mock).mockResolvedValue(3); // past due

    const res = await svc.ops();
    expect(res.feedbackTotal).toBe(12);
    expect(res.feedbackAvgRating).toBe(4.25);
    expect(res.pastDueSubscriptions).toBe(3);
    expect(res.recentFeedback[0].comment).toBe('great');
    expect(res.sentryUrl).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-api test -- admin-analytics.service`
Expected: FAIL — `svc.ops is not a function`.

- [ ] **Step 3: Implement ops**

Add `OpsMetrics` to the `@finby/shared` import list, then add:

```typescript
  async ops(): Promise<OpsMetrics> {
    return this.cached('admin:metrics:ops', async () => {
      const [feedbackTotal, avg, recent, pastDueSubscriptions] = await Promise.all([
        this.prisma.feedback.count(),
        this.prisma.feedback.aggregate({ _avg: { rating: true } }),
        this.prisma.feedback.findMany({
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { rating: true, comment: true, createdAt: true },
        }),
        this.prisma.subscription.count({ where: { status: 'PAST_DUE' } }),
      ]);
      // SENTRY_DSN is a DSN, not a dashboard URL; expose an explicit project URL if set.
      const sentryUrl = this.config.get('ADMIN_SENTRY_URL', { infer: true }) ?? null;
      return {
        feedbackTotal,
        feedbackAvgRating: avg._avg.rating ?? null,
        recentFeedback: recent.map((f) => ({
          rating: f.rating,
          comment: f.comment,
          createdAt: f.createdAt.toISOString(),
        })),
        pastDueSubscriptions,
        sentryUrl,
      };
    });
  }
```

- [ ] **Step 4: Add the `ADMIN_SENTRY_URL` env var**

In `apps/api/src/config/env.schema.ts`, add to the admin block:

```typescript
  ADMIN_SENTRY_URL: z.string().url().optional(), // dashboard link shown in the ops panel
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter finby-api test -- admin-analytics.service`
Expected: PASS (all 4 metric groups).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/admin/admin-analytics.service.ts apps/api/src/modules/admin/admin-analytics.service.spec.ts apps/api/src/config/env.schema.ts
git commit -m "feat(api): admin analytics service — ops metrics + Sentry link-out"
```

---

### Task B6: Admin analytics controller + module wiring

**Files:**
- Create: `apps/api/src/modules/admin/admin-analytics.controller.ts`
- Create: `apps/api/src/modules/admin/admin.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Implement the analytics controller**

```typescript
// apps/api/src/modules/admin/admin-analytics.controller.ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type {
  EngagementMetrics,
  GrowthMetrics,
  OpsMetrics,
  RevenueMetrics,
} from '@finby/shared';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { metricRangeSchema, type MetricRangeQuery } from './dto/admin.schemas';

// @Public() bypasses the global *user* JwtAuthGuard; AdminJwtGuard re-secures
// every route with an admin-scoped token. These routes are NOT unauthenticated.
@Public()
@UseGuards(AdminJwtGuard)
@Controller('admin/metrics')
export class AdminAnalyticsController {
  constructor(private readonly analytics: AdminAnalyticsService) {}

  @Get('growth')
  growth(@Query(new ZodValidationPipe(metricRangeSchema)) q: MetricRangeQuery): Promise<GrowthMetrics> {
    return this.analytics.growth(q);
  }

  @Get('engagement')
  engagement(@Query(new ZodValidationPipe(metricRangeSchema)) q: MetricRangeQuery): Promise<EngagementMetrics> {
    return this.analytics.engagement(q);
  }

  @Get('revenue')
  revenue(@Query(new ZodValidationPipe(metricRangeSchema)) q: MetricRangeQuery): Promise<RevenueMetrics> {
    return this.analytics.revenue(q);
  }

  @Get('ops')
  ops(): Promise<OpsMetrics> {
    return this.analytics.ops();
  }
}
```

- [ ] **Step 2: Implement the module**

```typescript
// apps/api/src/modules/admin/admin.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminJwtStrategy } from './strategies/admin-jwt.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AdminAuthController, AdminAnalyticsController],
  providers: [AdminAuthService, AdminAnalyticsService, AdminJwtStrategy],
})
export class AdminModule {}
```

> `PrismaService` and `RedisService` come from global modules (`PrismaModule`/`RedisModule` are global), so they don't need re-importing — confirm by checking `apps/api/src/prisma/prisma.module.ts` uses `@Global()`. If not, add `PrismaModule, RedisModule` to `imports`.

- [ ] **Step 3: Register AdminModule in app.module**

In `apps/api/src/app.module.ts`: add the import near the other module imports and add `AdminModule` to the `imports: [...]` array (after `AuthModule`).

```typescript
import { AdminModule } from './modules/admin/admin.module';
```

- [ ] **Step 4: Verify build + full API test suite**

Run: `pnpm --filter finby-api build && pnpm --filter finby-api test`
Expected: build succeeds; all tests pass (existing + new admin tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/admin-analytics.controller.ts apps/api/src/modules/admin/admin.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): wire admin module (auth + analytics endpoints)"
```

---

### Task B7: Guard integration test — user token rejected

**Files:**
- Create: `apps/api/src/modules/admin/admin-jwt.guard.spec.ts`

This is the explicit spec requirement: prove a normal user access token cannot reach admin routes.

- [ ] **Step 1: Write the test**

```typescript
// apps/api/src/modules/admin/admin-jwt.guard.spec.ts
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AdminJwtStrategy } from './strategies/admin-jwt.strategy';

// Verifies the strategy's secret/scope/allowlist gate directly: a token signed
// with the USER secret (or lacking scope:'admin') must not validate.
describe('Admin auth rejects user tokens', () => {
  const ADMIN_SECRET = 'admin-secret-aaaaaaaaaaaaaaaa';
  const USER_SECRET = 'user-secret-bbbbbbbbbbbbbbbb';
  const config = {
    get: (k: string) =>
      k === 'ADMIN_JWT_SECRET' ? ADMIN_SECRET : k === 'ADMIN_EMAILS' ? 'admin@x.com' : undefined,
  } as unknown as ConfigService;
  const jwt = new JwtService({});

  it('a user-secret token is not verifiable with the admin secret', () => {
    const userToken = jwt.sign({ sub: 'u1', email: 'admin@x.com' }, { secret: USER_SECRET });
    expect(() => jwt.verify(userToken, { secret: ADMIN_SECRET })).toThrow();
  });

  it('validate() rejects a token without scope:admin even if signed correctly', () => {
    const strategy = new AdminJwtStrategy(config as never);
    expect(() => strategy.validate({ sub: 'u1', email: 'admin@x.com', scope: 'user' as never })).toThrow(
      UnauthorizedException,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm --filter finby-api test -- admin-jwt.guard`
Expected: PASS (2 tests).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/admin/admin-jwt.guard.spec.ts
git commit -m "test(api): admin auth rejects user-scoped tokens"
```

---

## PHASE C — Admin web app (`apps/admin`)

### Task C1: Scaffold the Next.js admin app

**Files:**
- Create: `apps/admin/package.json`, `next.config.mjs`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs`, `next-env.d.ts`
- Create: `apps/admin/src/app/layout.tsx`, `apps/admin/src/app/globals.css`

Mirror `apps/web` config. Read `apps/web/package.json`, `apps/web/next.config.*`, `apps/web/tsconfig.json`, `apps/web/tailwind.config.*` first and copy the structure.

- [ ] **Step 1: Create package.json**

```json
{
  "name": "finby-admin",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3002",
    "build": "next build",
    "start": "next start -p 3002",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@finby/shared": "workspace:*",
    "next": "^15.1.3",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "recharts": "^2.15.0",
    "qrcode": "^1.5.4",
    "zustand": "^5.0.2"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "@types/qrcode": "^1.5.5",
    "@types/react": "^19.0.2",
    "@types/react-dom": "^19.0.2",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Copy config files from apps/web**

Create `apps/admin/next.config.mjs`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs` by copying `apps/web`'s equivalents verbatim (adjust any `paths`/content globs to point at `apps/admin/src`). For tailwind `content`, use:

```typescript
content: ['./src/**/*.{ts,tsx}'],
```

- [ ] **Step 3: Create globals.css + root layout**

```css
/* apps/admin/src/app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

```tsx
// apps/admin/src/app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Finby Admin', robots: 'noindex,nofollow' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Install deps + verify it builds**

Run: `pnpm install && pnpm --filter finby-admin build`
Expected: Next build succeeds (empty app with a root layout; add a placeholder `src/app/page.tsx` returning `null` if build complains about a missing index route).

- [ ] **Step 5: Commit**

```bash
git add apps/admin
git commit -m "feat(admin): scaffold Next.js admin app"
```

---

### Task C2: API client + admin token store

**Files:**
- Create: `apps/admin/src/lib/api.ts`
- Create: `apps/admin/src/lib/auth-store.ts`

- [ ] **Step 1: Token store (Zustand, persisted to localStorage)**

```typescript
// apps/admin/src/lib/auth-store.ts
'use client';
import { create } from 'zustand';

const STORAGE_KEY = 'finby_admin_token';

interface AuthState {
  token: string | null;
  setToken: (t: string | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY),
  setToken: (t) => {
    if (typeof window !== 'undefined') {
      if (t) window.localStorage.setItem(STORAGE_KEY, t);
      else window.localStorage.removeItem(STORAGE_KEY);
    }
    set({ token: t });
  },
}));
```

- [ ] **Step 2: API client**

```typescript
// apps/admin/src/lib/api.ts
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function token(): string | null {
  return typeof window === 'undefined' ? null : window.localStorage.getItem('finby_admin_token');
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) throw new ApiError(res.status, `Request failed: ${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  login: (body: { email: string; password: string; totp?: string }) =>
    request<{ accessToken: string; email: string }>('/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  enroll: (body: { email: string; password: string }) =>
    request<{ otpauthUrl: string; secret: string }>('/admin/auth/totp/enroll', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  growth: () => request<import('@finby/shared').GrowthMetrics>('/admin/metrics/growth'),
  engagement: () => request<import('@finby/shared').EngagementMetrics>('/admin/metrics/engagement'),
  revenue: () => request<import('@finby/shared').RevenueMetrics>('/admin/metrics/revenue'),
  ops: () => request<import('@finby/shared').OpsMetrics>('/admin/metrics/ops'),
};
```

- [ ] **Step 3: Add NEXT_PUBLIC_API_URL to .env.example**

Add to `.env.example`:

```bash
# Admin dashboard (apps/admin)
NEXT_PUBLIC_API_URL=http://localhost:3001
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter finby-admin typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/lib .env.example
git commit -m "feat(admin): API client + token store"
```

---

### Task C3: Login + TOTP enrollment page

**Files:**
- Create: `apps/admin/src/app/login/page.tsx`
- Create: `apps/admin/src/components/LoginForm.tsx`

- [ ] **Step 1: Login form component**

```tsx
// apps/admin/src/components/LoginForm.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { api, ApiError } from '../lib/api';
import { useAuthStore } from '../lib/auth-store';

export function LoginForm() {
  const router = useRouter();
  const setToken = useAuthStore((s) => s.setToken);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { accessToken } = await api.login({ email, password, totp });
      setToken(accessToken);
      router.push('/');
    } catch (err) {
      // 401 with "TOTP enrollment required" → kick off enrollment.
      if (err instanceof ApiError && err.status === 401 && !qr) {
        try {
          const { otpauthUrl } = await api.enroll({ email, password });
          setQr(await QRCode.toDataURL(otpauthUrl));
          setError('Scan this QR in your authenticator app, then enter the 6-digit code.');
        } catch {
          setError('Invalid credentials.');
        }
      } else {
        setError('Invalid credentials or code.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-24 flex w-full max-w-sm flex-col gap-3 rounded-xl border bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold">Finby Admin</h1>
      <input className="rounded border px-3 py-2" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input className="rounded border px-3 py-2" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {qr && <img src={qr} alt="TOTP QR" className="mx-auto h-44 w-44" />}
      <input className="rounded border px-3 py-2" inputMode="numeric" pattern="\d{6}" placeholder="6-digit code" value={totp} onChange={(e) => setTotp(e.target.value)} />
      {error && <p className="text-sm text-amber-700">{error}</p>}
      <button disabled={busy} className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50">
        {busy ? '…' : 'Sign in'}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Login page**

```tsx
// apps/admin/src/app/login/page.tsx
import { LoginForm } from '../../components/LoginForm';

export default function LoginPage() {
  return <LoginForm />;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter finby-admin typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/app/login apps/admin/src/components/LoginForm.tsx
git commit -m "feat(admin): login + TOTP enrollment page"
```

---

### Task C4: Auth gate + dashboard shell

**Files:**
- Create: `apps/admin/src/components/AuthGate.tsx`
- Create: `apps/admin/src/app/page.tsx`
- Test: `apps/admin/src/components/AuthGate.test.tsx`

- [ ] **Step 1: Write the failing gate test**

```tsx
// apps/admin/src/components/AuthGate.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthGate } from './AuthGate';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

describe('AuthGate', () => {
  beforeEach(() => {
    push.mockClear();
    window.localStorage.clear();
  });

  it('redirects to /login when there is no token', () => {
    render(<AuthGate><div>secret</div></AuthGate>);
    expect(push).toHaveBeenCalledWith('/login');
    expect(screen.queryByText('secret')).toBeNull();
  });

  it('renders children when a token exists', () => {
    window.localStorage.setItem('finby_admin_token', 'tok');
    render(<AuthGate><div>secret</div></AuthGate>);
    expect(screen.getByText('secret')).toBeTruthy();
  });
});
```

Also create `apps/admin/vitest.config.ts` and `apps/admin/src/test-setup.ts` mirroring `apps/web`'s vitest setup (jsdom env + `@testing-library/jest-dom`). Read `apps/web/vitest.config.*` to copy the exact config.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-admin test -- AuthGate`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the gate**

```tsx
// apps/admin/src/components/AuthGate.tsx
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../lib/auth-store';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!token) router.push('/login');
  }, [token, router]);

  if (!token) return null;
  return <>{children}</>;
}
```

- [ ] **Step 4: Dashboard shell page**

```tsx
// apps/admin/src/app/page.tsx
'use client';
import { AuthGate } from '../components/AuthGate';
import { Dashboard } from '../components/Dashboard';

export default function Page() {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter finby-admin test -- AuthGate`
Expected: PASS (2 tests). (`Dashboard` is created in C5; if the page import breaks the test build, the test imports only `AuthGate`, so it passes independently.)

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/components/AuthGate.tsx apps/admin/src/components/AuthGate.test.tsx apps/admin/src/app/page.tsx apps/admin/vitest.config.ts apps/admin/src/test-setup.ts
git commit -m "feat(admin): auth gate + dashboard shell"
```

---

### Task C5: Dashboard UI — stat cards + charts

**Files:**
- Create: `apps/admin/src/components/Dashboard.tsx`
- Create: `apps/admin/src/components/StatCard.tsx`
- Create: `apps/admin/src/components/MetricChart.tsx`

- [ ] **Step 1: StatCard + MetricChart primitives**

```tsx
// apps/admin/src/components/StatCard.tsx
export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
```

```tsx
// apps/admin/src/components/MetricChart.tsx
'use client';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TimeSeriesPoint } from '@finby/shared';

export function MetricChart({ title, data }: { title: string; data: TimeSeriesPoint[] }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="mb-2 text-sm font-medium text-neutral-700">{title}</div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data}>
          <XAxis dataKey="date" fontSize={11} />
          <YAxis fontSize={11} allowDecimals={false} />
          <Tooltip />
          <Area type="monotone" dataKey="value" stroke="#171717" fill="#e5e5e5" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Dashboard with the four sections**

```tsx
// apps/admin/src/components/Dashboard.tsx
'use client';
import { useEffect, useState } from 'react';
import type { EngagementMetrics, GrowthMetrics, OpsMetrics, RevenueMetrics } from '@finby/shared';
import { api } from '../lib/api';
import { useAuthStore } from '../lib/auth-store';
import { StatCard } from './StatCard';
import { MetricChart } from './MetricChart';

export function Dashboard() {
  const setToken = useAuthStore((s) => s.setToken);
  const [growth, setGrowth] = useState<GrowthMetrics | null>(null);
  const [eng, setEng] = useState<EngagementMetrics | null>(null);
  const [rev, setRev] = useState<RevenueMetrics | null>(null);
  const [ops, setOps] = useState<OpsMetrics | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    Promise.all([api.growth(), api.engagement(), api.revenue(), api.ops()])
      .then(([g, e, r, o]) => { setGrowth(g); setEng(e); setRev(r); setOps(o); })
      .catch(() => setErr(true));
  }, []);

  if (err) return <div className="p-8">Failed to load metrics. <button className="underline" onClick={() => setToken(null)}>Sign out</button></div>;
  if (!growth || !eng || !rev || !ops) return <div className="p-8 text-neutral-500">Loading…</div>;

  const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Finby Analytics</h1>
        <button className="text-sm text-neutral-500 underline" onClick={() => setToken(null)}>Sign out</button>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-600">Growth &amp; Users</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Total users" value={growth.totalUsers} />
          <StatCard label="Workspaces" value={growth.totalWorkspaces} />
          <StatCard label="DAU / WAU / MAU" value={`${growth.dau}/${growth.wau}/${growth.mau}`} />
          <StatCard label="Paid workspaces" value={growth.tierSplit.paid} />
        </div>
        <MetricChart title="New signups / day" data={growth.signups} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-600">Engagement</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Transactions" value={eng.totalTransactions} />
          <StatCard label="Avg txn / active user" value={eng.avgTransactionsPerActiveUser} />
          <StatCard label="Conversations" value={eng.conversations} />
          <StatCard label="Chat messages" value={eng.chatMessages} />
        </div>
        <MetricChart title="Transactions / day" data={eng.transactionsPerDay} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-600">Revenue</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="MRR" value={usd(rev.mrrMinor)} />
          <StatCard label="Trials" value={rev.trials} />
          <StatCard label="Paid (by tier)" value={rev.paidByTier.reduce((s, t) => s + t.count, 0)} />
          <StatCard label="Past due" value={ops.pastDueSubscriptions} />
        </div>
        <MetricChart title="New paid subs / day" data={rev.newPaidPerDay} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-600">Operational</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Feedback count" value={ops.feedbackTotal} />
          <StatCard label="Avg rating" value={ops.feedbackAvgRating ?? '—'} />
          <StatCard label="Past-due subs" value={ops.pastDueSubscriptions} />
          <StatCard label="Errors / cost" value={ops.sentryUrl ? 'Sentry ↗' : '—'} />
        </div>
        {ops.sentryUrl && (
          <a className="inline-block text-sm text-blue-700 underline" href={ops.sentryUrl} target="_blank" rel="noreferrer">
            Open Sentry for error rates &amp; LLM cost
          </a>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm --filter finby-admin typecheck && pnpm --filter finby-admin build`
Expected: PASS / build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/components/Dashboard.tsx apps/admin/src/components/StatCard.tsx apps/admin/src/components/MetricChart.tsx
git commit -m "feat(admin): dashboard UI with stat cards + charts"
```

---

## PHASE D — Deploy + manual verification

### Task D1: Deploy config + secrets documentation

**Files:**
- Modify: `render.yaml` (add admin env vars to `finby-api`)
- Modify: `.env.example`
- Create: `apps/admin/.env.example`

- [ ] **Step 1: Add admin secrets to render.yaml**

Under `finby-api` → `envVars`, add (non-secret first, then `sync:false` secrets):

```yaml
      - key: ADMIN_JWT_TTL
        value: 8h
      - key: ADMIN_TOTP_ISSUER
        value: Finby Admin
      # --- admin secrets: paste in the Render dashboard ---
      - key: ADMIN_EMAILS          # comma-separated allowlist
        sync: false
      - key: ADMIN_JWT_SECRET
        generateValue: true
      - key: ADMIN_SENTRY_URL      # optional: Sentry dashboard link for the ops panel
        sync: false
```

- [ ] **Step 2: Document the admin app env**

```bash
# apps/admin/.env.example
NEXT_PUBLIC_API_URL=https://api.finby.app
```

- [ ] **Step 3: Update CORS to allow the admin origin**

In `apps/api/src/main.ts`, the CORS `origin` currently allows only `WEB_URL`. Change it to accept an array including the admin origin. Add an `ADMIN_WEB_URL` env var (`apps/api/src/config/env.schema.ts`, default `http://localhost:3002`) and update:

```typescript
  app.enableCors({
    origin: [process.env.WEB_URL ?? 'http://localhost:3000', process.env.ADMIN_WEB_URL ?? 'http://localhost:3002'],
    // keep the existing credentials/methods options unchanged
  });
```

Add `ADMIN_WEB_URL` to `render.yaml` (`value: https://admin.finby.app`).

- [ ] **Step 4: Commit**

```bash
git add render.yaml .env.example apps/admin/.env.example apps/api/src/main.ts apps/api/src/config/env.schema.ts
git commit -m "feat: admin deploy config + CORS for admin origin"
```

---

### Task D2: End-to-end manual verification

- [ ] **Step 1: Boot the stack locally**

```bash
pnpm db:up
# set in .env: ADMIN_EMAILS=<your finby account email>, ADMIN_JWT_SECRET=<32+ random chars>
pnpm --filter finby-api dev   # terminal 1
pnpm --filter finby-admin dev # terminal 2
```

- [ ] **Step 2: Seed data if empty**

Run: `pnpm db:seed` (so metrics are non-zero).

- [ ] **Step 3: Verify the enrollment + login flow**

1. Open `http://localhost:3002` → redirected to `/login`.
2. Enter your Finby email + password, leave code blank, submit → QR appears.
3. Scan QR in an authenticator app, enter the 6-digit code, submit → dashboard loads.
4. Confirm all four sections render with numbers and the charts draw.

- [ ] **Step 4: Verify a non-admin is blocked**

```bash
# Log in as a NON-allowlisted user via the normal user login, grab its accessToken, then:
curl -i -H "Authorization: Bearer <USER_TOKEN>" http://localhost:3001/api/v1/admin/metrics/growth
```
Expected: `401 Unauthorized` (user token can't pass AdminJwtGuard).

- [ ] **Step 5: Full repo checks**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass.

- [ ] **Step 6: Final commit (if any lint/format fixes)**

```bash
git add -A
git commit -m "chore: lint/format pass for admin dashboard"
```

---

## Self-review notes (coverage map)

- **Security model** → Tasks A1–A3, A5, A6, B7 (edge gate documented in D1; allowlist A2; separate secret + scope + live allowlist A3; TOTP A5; user-token rejection B7).
- **AdminTotpSecret + "admin-ness not a DB column"** → A1 (model holds only TOTP secret; allowlist governs access in A2/A3/A5).
- **Growth / Engagement / Revenue / Ops endpoints** → B2 / B3 / B4 / B5, wired in B6.
- **MRR from TIER_PRICING** → B4.
- **Active-user definition (login OR transaction; chat as volume)** → B2 (`activeUserCount`) + documented in conventions.
- **Retention → v2** → not implemented (out of scope, per spec non-goals).
- **Sentry link-out for ops** → B5 (`sentryUrl`) + Dashboard C5 + env D1.
- **Separate app, own deploy, edge gate** → C1–C5 + D1 (Vercel project `admin.finby.app` + Vercel deployment protection — set in the Vercel dashboard, noted in D1).
- **Tests: aggregations + user-token-rejected + login gating** → B2–B5, B7, C4.

> **Vercel edge protection** is a dashboard setting on the `finby-admin` Vercel project (Settings → Deployment Protection → enable for production), not a code change — enable it when creating the project. The `robots: noindex` in the root layout (C1) is a secondary guard.
