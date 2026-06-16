# Admin-Managed Feature Announcements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move feature announcements from a hardcoded web array into a DB-backed, server-driven system the super-admin authors, schedules, targets, orders, publishes, and measures from the admin dashboard — migrating the 4 existing announcements with zero visible change to existing users.

**Architecture:** New `Announcement` + `AnnouncementInteraction` Prisma tables. A public `AnnouncementsModule` serves the single active announcement per user (tier/lifecycle/dismissal filtered, server-decided) and records seen/dismiss. An `/admin/announcements` CRUD API + admin-dashboard UI manage content. The web app fetches the active announcement and maps it onto the *existing* `Announcement` interface, so the modal/confetti UI is untouched. A boot-time idempotent seed inserts the 4 existing announcements; a one-time backfill copies existing `preferences.dismissedAnnouncements` into interaction rows.

**Tech Stack:** NestJS + Prisma 5 (Jest unit tests, mock-prisma), Next.js 15 web + admin (Vitest + Testing Library), Zod DTOs, shared `@finby/shared` package.

---

## File Structure

**Shared (`packages/shared/src/`)**
- Create `announcements.ts` — public + admin announcement view/input types.
- Create `announcement-assets.ts` — Lottie registry + `lottiePathForKey`.
- Modify `index.ts` — export the two new modules.

**API (`apps/api/`)**
- Modify `prisma/schema.prisma` — two models, three enums, User back-relation.
- Create `prisma/migrations/<ts>_admin_managed_announcements/` — generated.
- Create `src/modules/announcements/announcement.types.ts` — view mapper + `toAnnouncementView`.
- Create `src/modules/announcements/announcements.service.ts` — active-selection, seen, dismiss.
- Create `src/modules/announcements/announcements.service.spec.ts`.
- Create `src/modules/announcements/announcements.controller.ts`.
- Create `src/modules/announcements/announcements.module.ts`.
- Create `src/modules/announcements/seeds/announcement-defs.seed.ts` — the 4 seeded announcements.
- Modify `src/prisma/prisma.service.ts` — seed announcements + dismissal backfill on boot.
- Create `src/modules/admin/admin-announcements.service.ts` + `.spec.ts`.
- Create `src/modules/admin/admin-announcements.controller.ts`.
- Modify `src/modules/admin/dto/admin.schemas.ts` — create/update schemas.
- Modify `src/modules/admin/admin.module.ts` — register controller + service.
- Modify `src/app.module.ts` — register `AnnouncementsModule`.

**Web (`apps/web/src/`)**
- Modify `lib/announcements.ts` — keep the `Announcement` interface; delete `ANNOUNCEMENTS` + `pickAnnouncement`.
- Delete `lib/announcements.test.ts` (tests the removed `pickAnnouncement`).
- Create `lib/announcements-api.ts` — fetch + map API view → `Announcement`.
- Create `lib/announcements-api.test.ts` — mapping tests.
- Modify `components/announcements/announcement-host.tsx` — fetch-driven.
- Rewrite `components/announcements/announcement-host.test.tsx`.

**Admin (`apps/admin/src/`)**
- Modify `lib/api.ts` — announcement client methods.
- Create `components/ui/toggle.tsx` — non-native toggle (Finby UI rule).
- Create `components/AnnouncementForm.tsx` + `.test.tsx`.
- Create `components/AnnouncementsTable.tsx` + `.test.tsx`.
- Create `app/announcements/page.tsx`.
- Modify `components/AdminShell.tsx` — add nav link.

---

## Conventions for every task

- Run API tests with `pnpm --filter finby-api test -- <path>`; web with `pnpm --filter finby-web test -- <path>`; admin with `pnpm --filter finby-admin test -- <path>`.
- Commit messages: NO AI-attribution trailer (project hard rule). One logical change per commit.
- No `any`. No native `<select>`/`<input type=date>`/`<input type=checkbox>` in feature code.

---

## Phase A — Shared types + Lottie registry

### Task 1: Lottie registry in shared

**Files:**
- Create: `packages/shared/src/announcement-assets.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create the registry**

```ts
// packages/shared/src/announcement-assets.ts
/** Bundled Lottie animations available to announcements. The JSON files ship in
 *  apps/web/public/lottie/. Admins pick by `key`; new artwork is a dev task
 *  (drop the .json in public/lottie/ + add one entry here). */
export interface LottieAsset {
  key: string;
  label: string;
  path: string;
}

export const LOTTIE_REGISTRY: readonly LottieAsset[] = [
  { key: 'streak-flame', label: 'Streak flame', path: '/lottie/streak-flame.json' },
  { key: 'notif-bell', label: 'Notification bell', path: '/lottie/notif-bell.json' },
  { key: 'receipt-scan', label: 'Receipt scan', path: '/lottie/receipt-scan.json' },
  { key: 'account-cards', label: 'Account cards', path: '/lottie/account-cards.json' },
] as const;

export const LOTTIE_KEYS: readonly string[] = LOTTIE_REGISTRY.map((a) => a.key);

/** Resolve a registry key to its public path, or null if unknown/absent. */
export function lottiePathForKey(key: string | null | undefined): string | null {
  if (!key) return null;
  return LOTTIE_REGISTRY.find((a) => a.key === key)?.path ?? null;
}
```

- [ ] **Step 2: Export from index**

Add to `packages/shared/src/index.ts`:

```ts
export * from './announcement-assets';
export * from './announcements';
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/announcement-assets.ts packages/shared/src/index.ts
git commit -m "feat(shared): add Lottie registry for announcements"
```

### Task 2: Shared announcement types

**Files:**
- Create: `packages/shared/src/announcements.ts`

- [ ] **Step 1: Create the types**

```ts
// packages/shared/src/announcements.ts
import type { SubscriptionTier } from './types';

export type AnnouncementMode = 'SIMPLE' | 'STEPS';
export type AnnouncementPrimaryKind = 'DISMISS' | 'ENABLE_PUSH';
export type AnnouncementStatus = 'DRAFT' | 'PUBLISHED';

export interface AnnouncementStepView {
  label: string;
  caption: string;
}

/** Client-facing shape returned by GET /announcements/active. */
export interface AnnouncementView {
  id: string;
  mode: AnnouncementMode;
  title: string;
  body: string;
  emoji: string | null;
  imageUrl: string | null;
  lottieKey: string | null;
  hashtag: string | null;
  confetti: boolean;
  steps: AnnouncementStepView[] | null;
  primaryLabel: string;
  primaryKind: AnnouncementPrimaryKind;
  expiresAt: string | null;
}

/** Admin list row: full record + derived analytics counts. */
export interface AdminAnnouncement extends AnnouncementView {
  key: string;
  status: AnnouncementStatus;
  targetTier: SubscriptionTier | null;
  order: number;
  publishAt: string | null;
  createdAt: string;
  updatedAt: string;
  seenCount: number;
  dismissedCount: number;
}

/** Payload for create (full) / update (partial) from the admin dashboard. */
export interface AdminAnnouncementInput {
  key: string;
  status: AnnouncementStatus;
  mode: AnnouncementMode;
  title: string;
  body: string;
  emoji?: string | null;
  imageUrl?: string | null;
  lottieKey?: string | null;
  hashtag?: string | null;
  confetti: boolean;
  steps?: AnnouncementStepView[] | null;
  primaryLabel: string;
  primaryKind: AnnouncementPrimaryKind;
  targetTier?: SubscriptionTier | null;
  order: number;
  publishAt?: string | null;
  expiresAt?: string | null;
}
```

- [ ] **Step 2: Build shared to verify types compile**

Run: `pnpm --filter @finby/shared build`
Expected: success (or, if shared has no build script, `pnpm --filter finby-api exec tsc --noEmit` later in Task 3 will catch errors).

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/announcements.ts
git commit -m "feat(shared): announcement view + admin types"
```

---

## Phase B — Prisma model + migration

### Task 3: Schema + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: migration directory (generated)

- [ ] **Step 1: Add enums** near the other enums (after `SubscriptionStatus`, around line 40):

```prisma
enum AnnouncementStatus      { DRAFT  PUBLISHED }
enum AnnouncementMode        { SIMPLE STEPS }
enum AnnouncementPrimaryKind { DISMISS ENABLE_PUSH }
```

- [ ] **Step 2: Add models** at the end of the schema:

```prisma
model Announcement {
  id           String   @id @default(cuid())
  key          String   @unique
  status       AnnouncementStatus      @default(DRAFT)
  mode         AnnouncementMode        @default(SIMPLE)
  title        String
  body         String
  emoji        String?
  imageUrl     String?
  lottieKey    String?
  hashtag      String?
  confetti     Boolean  @default(false)
  steps        Json?
  primaryLabel String
  primaryKind  AnnouncementPrimaryKind  @default(DISMISS)
  targetTier   SubscriptionTier?
  order        Int      @default(0)
  publishAt    DateTime?
  expiresAt    DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  interactions AnnouncementInteraction[]

  @@index([status, order])
}

model AnnouncementInteraction {
  id             String       @id @default(cuid())
  announcementId String
  announcement   Announcement @relation(fields: [announcementId], references: [id], onDelete: Cascade)
  userId         String
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  seenAt         DateTime     @default(now())
  dismissedAt    DateTime?

  @@unique([announcementId, userId])
  @@index([announcementId])
}
```

- [ ] **Step 3: Add the User back-relation.** In `model User`, alongside `workspaceMemberships WorkspaceMember[]`, add:

```prisma
  announcementInteractions AnnouncementInteraction[]
```

- [ ] **Step 4: Generate the migration**

Run: `pnpm --filter finby-api run prisma:migrate -- --name admin_managed_announcements`
Expected: new migration applied to the local DB; `prisma generate` runs; no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(announcements): Announcement + AnnouncementInteraction schema"
```

---

## Phase C — API: public AnnouncementsModule

### Task 4: View mapper

**Files:**
- Create: `apps/api/src/modules/announcements/announcement.types.ts`

- [ ] **Step 1: Write the mapper**

```ts
// apps/api/src/modules/announcements/announcement.types.ts
import type { Announcement } from '@prisma/client';
import type { AnnouncementStepView, AnnouncementView } from '@finby/shared';

/** Prisma row → client-facing view. `steps` is stored as JSON; cast defensively. */
export function toAnnouncementView(a: Announcement): AnnouncementView {
  return {
    id: a.id,
    mode: a.mode,
    title: a.title,
    body: a.body,
    emoji: a.emoji,
    imageUrl: a.imageUrl,
    lottieKey: a.lottieKey,
    hashtag: a.hashtag,
    confetti: a.confetti,
    steps: (a.steps as AnnouncementStepView[] | null) ?? null,
    primaryLabel: a.primaryLabel,
    primaryKind: a.primaryKind,
    expiresAt: a.expiresAt ? a.expiresAt.toISOString() : null,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/announcements/announcement.types.ts
git commit -m "feat(announcements): Prisma row to view mapper"
```

### Task 5: AnnouncementsService — active selection (TDD)

**Files:**
- Create: `apps/api/src/modules/announcements/announcements.service.ts`
- Test: `apps/api/src/modules/announcements/announcements.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/announcements/announcements.service.spec.ts
import { PrismaService } from '../../prisma/prisma.service';
import { AnnouncementsService } from './announcements.service';

function buildPrisma() {
  return {
    workspaceMember: { findFirst: jest.fn() },
    announcement: { findMany: jest.fn() },
    announcementInteraction: { upsert: jest.fn() },
  };
}

const row = {
  id: 'an1', key: 'streaks-2026-06', status: 'PUBLISHED', mode: 'SIMPLE',
  title: 'Streaks are here', body: 'Log daily', emoji: '🔥', imageUrl: null,
  lottieKey: 'streak-flame', hashtag: 'New', confetti: true, steps: null,
  primaryLabel: 'Got it', primaryKind: 'DISMISS', targetTier: null, order: 0,
  publishAt: null, expiresAt: null, createdAt: new Date(), updatedAt: new Date(),
};

describe('AnnouncementsService.getActive', () => {
  it('resolves the owner tier and returns the first matching announcement as a view', async () => {
    const prisma = buildPrisma();
    prisma.workspaceMember.findFirst.mockResolvedValue({ workspace: { tier: 'PRO' } });
    prisma.announcement.findMany.mockResolvedValue([row]);
    const service = new AnnouncementsService(prisma as unknown as PrismaService);

    const result = await service.getActive('u1');

    expect(prisma.workspaceMember.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u1', role: 'OWNER' },
      select: { workspace: { select: { tier: true } } },
    });
    expect(prisma.announcement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PUBLISHED',
          OR: [{ targetTier: null }, { targetTier: 'PRO' }],
          interactions: { none: { userId: 'u1', dismissedAt: { not: null } } },
        }),
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        take: 1,
      }),
    );
    expect(result).toMatchObject({ id: 'an1', lottieKey: 'streak-flame', primaryKind: 'DISMISS' });
  });

  it('defaults to FREE tier when the user owns no workspace, and returns null when none match', async () => {
    const prisma = buildPrisma();
    prisma.workspaceMember.findFirst.mockResolvedValue(null);
    prisma.announcement.findMany.mockResolvedValue([]);
    const service = new AnnouncementsService(prisma as unknown as PrismaService);

    const result = await service.getActive('u1');

    expect(prisma.announcement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ OR: [{ targetTier: null }, { targetTier: 'FREE' }] }),
      }),
    );
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-api test -- announcements.service.spec`
Expected: FAIL — cannot find module `./announcements.service`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/api/src/modules/announcements/announcements.service.ts
import { Injectable } from '@nestjs/common';
import type { SubscriptionTier, AnnouncementView } from '@finby/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { toAnnouncementView } from './announcement.types';

@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Effective tier = tier of the workspace this user OWNs (FREE if none). */
  private async resolveTier(userId: string): Promise<SubscriptionTier> {
    const m = await this.prisma.workspaceMember.findFirst({
      where: { userId, role: 'OWNER' },
      select: { workspace: { select: { tier: true } } },
    });
    return m?.workspace.tier ?? 'FREE';
  }

  /** The single next announcement for this user, or null. Server decides:
   *  published, within publish/expiry window, tier-matched, not yet dismissed. */
  async getActive(userId: string): Promise<AnnouncementView | null> {
    const tier = await this.resolveTier(userId);
    const now = new Date();
    const rows = await this.prisma.announcement.findMany({
      where: {
        status: 'PUBLISHED',
        OR: [{ targetTier: null }, { targetTier: tier }],
        AND: [
          { OR: [{ publishAt: null }, { publishAt: { lte: now } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ],
        interactions: { none: { userId, dismissedAt: { not: null } } },
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      take: 1,
    });
    return rows[0] ? toAnnouncementView(rows[0]) : null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-api test -- announcements.service.spec`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/announcements/announcements.service.ts apps/api/src/modules/announcements/announcements.service.spec.ts
git commit -m "feat(announcements): server-side active selection"
```

### Task 6: AnnouncementsService — seen + dismiss (TDD)

**Files:**
- Modify: `apps/api/src/modules/announcements/announcements.service.ts`
- Modify: `apps/api/src/modules/announcements/announcements.service.spec.ts`

- [ ] **Step 1: Add the failing tests** (append inside the spec file, new `describe`):

```ts
describe('AnnouncementsService interactions', () => {
  it('markSeen upserts without overwriting an existing seenAt', async () => {
    const prisma = buildPrisma();
    const service = new AnnouncementsService(prisma as unknown as PrismaService);
    await service.markSeen('an1', 'u1');
    expect(prisma.announcementInteraction.upsert).toHaveBeenCalledWith({
      where: { announcementId_userId: { announcementId: 'an1', userId: 'u1' } },
      create: { announcementId: 'an1', userId: 'u1' },
      update: {},
    });
  });

  it('markDismissed stamps dismissedAt on create and update', async () => {
    const prisma = buildPrisma();
    const service = new AnnouncementsService(prisma as unknown as PrismaService);
    await service.markDismissed('an1', 'u1');
    const call = prisma.announcementInteraction.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ announcementId_userId: { announcementId: 'an1', userId: 'u1' } });
    expect(call.create.dismissedAt).toBeInstanceOf(Date);
    expect(call.update.dismissedAt).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-api test -- announcements.service.spec`
Expected: FAIL — `service.markSeen is not a function`.

- [ ] **Step 3: Add the methods** to `AnnouncementsService`:

```ts
  /** Record an impression (idempotent: seenAt is set once, on create). */
  async markSeen(announcementId: string, userId: string): Promise<void> {
    await this.prisma.announcementInteraction.upsert({
      where: { announcementId_userId: { announcementId, userId } },
      create: { announcementId, userId },
      update: {},
    });
  }

  /** Record a dismissal (idempotent). Replaces the old preferences write. */
  async markDismissed(announcementId: string, userId: string): Promise<void> {
    const now = new Date();
    await this.prisma.announcementInteraction.upsert({
      where: { announcementId_userId: { announcementId, userId } },
      create: { announcementId, userId, dismissedAt: now },
      update: { dismissedAt: now },
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-api test -- announcements.service.spec`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/announcements/announcements.service.ts apps/api/src/modules/announcements/announcements.service.spec.ts
git commit -m "feat(announcements): seen + dismiss interaction tracking"
```

### Task 7: Controller + module wiring

**Files:**
- Create: `apps/api/src/modules/announcements/announcements.controller.ts`
- Create: `apps/api/src/modules/announcements/announcements.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write the controller**

```ts
// apps/api/src/modules/announcements/announcements.controller.ts
import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import type { AnnouncementView } from '@finby/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { AnnouncementsService } from './announcements.service';

/** Authed user endpoints. The global JwtAuthGuard secures these (no @Public()). */
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get('active')
  async active(@CurrentUser() user: AuthUser): Promise<{ announcement: AnnouncementView | null }> {
    return { announcement: await this.announcements.getActive(user.userId) };
  }

  @Post(':id/seen')
  @HttpCode(204)
  async seen(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.announcements.markSeen(id, user.userId);
  }

  @Post(':id/dismiss')
  @HttpCode(204)
  async dismiss(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.announcements.markDismissed(id, user.userId);
  }
}
```

- [ ] **Step 2: Write the module**

```ts
// apps/api/src/modules/announcements/announcements.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';

@Module({
  imports: [PrismaModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService],
})
export class AnnouncementsModule {}
```

> If `PrismaModule` is global (check `apps/api/src/prisma/prisma.module.ts` for `@Global()`), drop the `imports` line. Match whatever sibling modules (e.g. `gamification.module.ts`) do.

- [ ] **Step 3: Register in app.module**

In `apps/api/src/app.module.ts`, import `AnnouncementsModule` and add it to the `imports` array (alongside the other feature modules).

- [ ] **Step 4: Verify the app compiles + boots**

Run: `pnpm --filter finby-api build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/announcements/announcements.controller.ts apps/api/src/modules/announcements/announcements.module.ts apps/api/src/app.module.ts
git commit -m "feat(announcements): public active/seen/dismiss endpoints"
```

---

## Phase D — API: seed + dismissal backfill

### Task 8: Announcement seed defs

**Files:**
- Create: `apps/api/src/modules/announcements/seeds/announcement-defs.seed.ts`

- [ ] **Step 1: Create the defs** (content lifted verbatim from the current `apps/web/src/lib/announcements.ts`, keys preserved, `order` matching array order, all `PUBLISHED`):

```ts
// apps/api/src/modules/announcements/seeds/announcement-defs.seed.ts
import { Prisma } from '@prisma/client';

/** Canonical launch announcements. Upserted by `key` on boot so every
 *  environment has them; `key` matches the legacy id stored in
 *  user.preferences.dismissedAnnouncements for backfill continuity. */
export const ANNOUNCEMENT_DEFS: Prisma.AnnouncementCreateInput[] = [
  {
    key: 'streaks-2026-06', status: 'PUBLISHED', mode: 'SIMPLE', order: 0,
    title: 'Streaks are here',
    body: 'Log something every day to build a spending streak. Keep the flame alive — miss a day and it resets to zero.',
    emoji: '🔥', lottieKey: 'streak-flame', hashtag: 'New', confetti: true,
    primaryLabel: 'Got it', primaryKind: 'DISMISS',
  },
  {
    key: 'in-app-notifs-2026-06', status: 'PUBLISHED', mode: 'STEPS', order: 1,
    title: 'Turn on notifications',
    body: 'Get your daily summary and a gentle nudge if you forget to log — right on this device.',
    emoji: '🔔', lottieKey: 'notif-bell', hashtag: 'Stay on track', confetti: false,
    steps: [
      { label: 'Tap “Turn on notifications”', caption: 'We’ll ask your browser for permission.' },
      { label: 'Allow when prompted', caption: 'One tap — no app store, no settings hunting.' },
      { label: 'You’re set', caption: 'Daily summary + reminders land on this device.' },
    ],
    primaryLabel: 'Turn on notifications', primaryKind: 'ENABLE_PUSH',
  },
  {
    key: 'receipt-scanning-2026-06', status: 'PUBLISHED', mode: 'STEPS', order: 2,
    title: 'Scan receipts, skip the typing',
    body: 'Snap a photo of any receipt and Finby fills in the merchant, amount, date, and category for you. Available on Pro and up.',
    emoji: '🧾', lottieKey: 'receipt-scan', hashtag: 'New', confetti: true,
    steps: [
      { label: 'Tap the camera in chat', caption: 'Or “Scan Receipt” on the Transactions screen.' },
      { label: 'Snap your receipt', caption: 'We read the details — photos are never stored.' },
      { label: 'Review and save', caption: 'Fix anything we misread, then one tap to log it.' },
    ],
    primaryLabel: 'Got it', primaryKind: 'DISMISS',
  },
  {
    key: 'accounts-2026-06', status: 'PUBLISHED', mode: 'STEPS', order: 3,
    title: 'Set up your accounts',
    body: 'Add your bank, cash, e-wallet, brokerage, or crypto accounts so every transaction lands in the right place and your balances stay accurate.',
    emoji: '🏦', lottieKey: 'account-cards', hashtag: 'New', confetti: true,
    steps: [
      { label: 'Just ask in chat', caption: '“Add my bank account” or “create a savings account with $5,000”.' },
      { label: 'Or open Settings → Accounts', caption: 'Add, rename, and archive accounts any time.' },
      { label: 'Balances track themselves', caption: 'Every transaction you log updates the right account.' },
    ],
    primaryLabel: 'Got it', primaryKind: 'DISMISS',
  },
];
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/announcements/seeds/announcement-defs.seed.ts
git commit -m "feat(announcements): seed defs for the 4 launch announcements"
```

### Task 9: Boot-time seed + dismissal backfill

**Files:**
- Modify: `apps/api/src/prisma/prisma.service.ts`

- [ ] **Step 1: Import the defs** at the top of `prisma.service.ts`:

```ts
import { ANNOUNCEMENT_DEFS } from '../modules/announcements/seeds/announcement-defs.seed';
```

- [ ] **Step 2: Call the new seed steps** inside `onModuleInit`, after `seedAchievementDefs()`:

```ts
  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.seedAchievementDefs();
    await this.seedAnnouncements();
    await this.backfillAnnouncementDismissals();
  }
```

- [ ] **Step 3: Add the seed method** (idempotent upsert by `key`; `steps` cast to Prisma JSON):

```ts
  /** Keep the launch announcements in sync on boot. Idempotent (upsert by key). */
  private async seedAnnouncements(): Promise<void> {
    for (const def of ANNOUNCEMENT_DEFS) {
      const { key, ...rest } = def;
      await this.announcement.upsert({
        where: { key },
        create: def,
        update: rest,
      });
    }
  }
```

- [ ] **Step 4: Add the one-time backfill** (guarded by an empty interaction table — the first boot after migration; subsequent boots skip):

```ts
  /** One-time migration: copy each user's legacy preferences.dismissedAnnouncements
   *  into AnnouncementInteraction rows (matched by announcement.key) so existing
   *  users never re-see what they already dismissed. Runs once: skipped as soon as
   *  any interaction row exists. */
  private async backfillAnnouncementDismissals(): Promise<void> {
    const existing = await this.announcementInteraction.count();
    if (existing > 0) return;

    const byKey = new Map<string, string>();
    const announcements = await this.announcement.findMany({ select: { id: true, key: true } });
    for (const a of announcements) byKey.set(a.key, a.id);

    const users = await this.user.findMany({ select: { id: true, preferences: true } });
    const now = new Date();
    for (const u of users) {
      const prefs = u.preferences as { dismissedAnnouncements?: string[] } | null;
      const keys = prefs?.dismissedAnnouncements ?? [];
      for (const key of keys) {
        const announcementId = byKey.get(key);
        if (!announcementId) continue;
        await this.announcementInteraction.upsert({
          where: { announcementId_userId: { announcementId, userId: u.id } },
          create: { announcementId, userId: u.id, dismissedAt: now },
          update: { dismissedAt: now },
        });
      }
    }
  }
```

- [ ] **Step 5: Verify boot seeds work against the local DB**

Run: `pnpm --filter finby-api build && pnpm --filter finby-api start` (boot once, watch logs for no errors, then stop with Ctrl-C). Optionally open `pnpm --filter finby-api run prisma:studio` and confirm 4 rows in `Announcement`.
Expected: 4 announcements present; backfill ran without error.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/prisma/prisma.service.ts
git commit -m "feat(announcements): boot seed + one-time dismissal backfill"
```

---

## Phase E — API: admin CRUD

### Task 10: Admin Zod schemas

**Files:**
- Modify: `apps/api/src/modules/admin/dto/admin.schemas.ts`

- [ ] **Step 1: Append the schemas** to `admin.schemas.ts`:

```ts
import { LOTTIE_KEYS } from '@finby/shared';

const announcementStepSchema = z.object({
  label: z.string().trim().min(1).max(120),
  caption: z.string().trim().min(1).max(200),
});

export const createAnnouncementSchema = z.object({
  key: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/, 'lowercase, digits, hyphens only'),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
  mode: z.enum(['SIMPLE', 'STEPS']).default('SIMPLE'),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(600),
  emoji: z.string().trim().max(8).nullish(),
  imageUrl: z.string().trim().url().max(500).nullish(),
  lottieKey: z.string().trim().refine((v) => LOTTIE_KEYS.includes(v), 'unknown lottie key').nullish(),
  hashtag: z.string().trim().max(40).nullish(),
  confetti: z.boolean().default(false),
  steps: z.array(announcementStepSchema).max(6).nullish(),
  primaryLabel: z.string().trim().min(1).max(60),
  primaryKind: z.enum(['DISMISS', 'ENABLE_PUSH']).default('DISMISS'),
  targetTier: z.enum(['FREE', 'PRO', 'PREMIUM', 'FAMILY']).nullish(),
  order: z.coerce.number().int().min(0).default(0),
  publishAt: z.coerce.date().nullish(),
  expiresAt: z.coerce.date().nullish(),
});
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;

export const updateAnnouncementSchema = createAnnouncementSchema.partial();
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/admin/dto/admin.schemas.ts
git commit -m "feat(admin): announcement create/update validation schemas"
```

### Task 11: AdminAnnouncementsService (TDD)

**Files:**
- Create: `apps/api/src/modules/admin/admin-announcements.service.ts`
- Test: `apps/api/src/modules/admin/admin-announcements.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/admin/admin-announcements.service.spec.ts
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAnnouncementsService } from './admin-announcements.service';

function buildPrisma() {
  return {
    announcement: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    announcementInteraction: { groupBy: jest.fn() },
  };
}

const row = {
  id: 'an1', key: 'streaks-2026-06', status: 'PUBLISHED', mode: 'SIMPLE',
  title: 'Streaks', body: 'b', emoji: '🔥', imageUrl: null, lottieKey: 'streak-flame',
  hashtag: 'New', confetti: true, steps: null, primaryLabel: 'Got it', primaryKind: 'DISMISS',
  targetTier: null, order: 0, publishAt: null, expiresAt: null,
  createdAt: new Date('2026-06-01'), updatedAt: new Date('2026-06-02'),
};

describe('AdminAnnouncementsService.list', () => {
  it('returns announcements with derived seen/dismissed counts', async () => {
    const prisma = buildPrisma();
    prisma.announcement.findMany.mockResolvedValue([row]);
    prisma.announcementInteraction.groupBy
      .mockResolvedValueOnce([{ announcementId: 'an1', _count: { _all: 10 } }])  // seen
      .mockResolvedValueOnce([{ announcementId: 'an1', _count: { _all: 4 } }]);  // dismissed
    const service = new AdminAnnouncementsService(prisma as unknown as PrismaService);

    const result = await service.list();

    expect(result[0]).toMatchObject({ id: 'an1', key: 'streaks-2026-06', seenCount: 10, dismissedCount: 4 });
  });
});

describe('AdminAnnouncementsService mutations', () => {
  it('create passes the input straight to prisma', async () => {
    const prisma = buildPrisma();
    prisma.announcement.create.mockResolvedValue(row);
    prisma.announcementInteraction.groupBy.mockResolvedValue([]);
    const service = new AdminAnnouncementsService(prisma as unknown as PrismaService);

    await service.create({
      key: 'x', status: 'DRAFT', mode: 'SIMPLE', title: 't', body: 'b',
      confetti: false, primaryLabel: 'Got it', primaryKind: 'DISMISS', order: 0,
    } as never);

    expect(prisma.announcement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ key: 'x' }) });
  });

  it('delete removes by id', async () => {
    const prisma = buildPrisma();
    const service = new AdminAnnouncementsService(prisma as unknown as PrismaService);
    await service.delete('an1');
    expect(prisma.announcement.delete).toHaveBeenCalledWith({ where: { id: 'an1' } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-api test -- admin-announcements.service.spec`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/api/src/modules/admin/admin-announcements.service.ts
import { Injectable } from '@nestjs/common';
import type { Announcement } from '@prisma/client';
import type { AdminAnnouncement } from '@finby/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateAnnouncementInput, UpdateAnnouncementInput } from './dto/admin.schemas';
import { toAnnouncementView } from '../announcements/announcement.types';

@Injectable()
export class AdminAnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  private toAdmin(a: Announcement, seen: number, dismissed: number): AdminAnnouncement {
    return {
      ...toAnnouncementView(a),
      key: a.key,
      status: a.status,
      targetTier: a.targetTier,
      order: a.order,
      publishAt: a.publishAt ? a.publishAt.toISOString() : null,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
      seenCount: seen,
      dismissedCount: dismissed,
    };
  }

  async list(): Promise<AdminAnnouncement[]> {
    const [rows, seenGroups, dismissedGroups] = await Promise.all([
      this.prisma.announcement.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.announcementInteraction.groupBy({ by: ['announcementId'], _count: { _all: true } }),
      this.prisma.announcementInteraction.groupBy({
        by: ['announcementId'], where: { dismissedAt: { not: null } }, _count: { _all: true },
      }),
    ]);
    const seen = new Map(seenGroups.map((g) => [g.announcementId, g._count._all]));
    const dismissed = new Map(dismissedGroups.map((g) => [g.announcementId, g._count._all]));
    return rows.map((a) => this.toAdmin(a, seen.get(a.id) ?? 0, dismissed.get(a.id) ?? 0));
  }

  async create(input: CreateAnnouncementInput): Promise<AdminAnnouncement> {
    const a = await this.prisma.announcement.create({ data: input as never });
    return this.toAdmin(a, 0, 0);
  }

  async update(id: string, input: UpdateAnnouncementInput): Promise<AdminAnnouncement> {
    const a = await this.prisma.announcement.update({ where: { id }, data: input as never });
    return this.toAdmin(a, 0, 0);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.announcement.delete({ where: { id } });
  }
}
```

> The `as never` casts on `data` bridge the Zod-inferred input (with `steps` as a plain array and `null`able optionals) to Prisma's generated input type. This mirrors how the codebase already passes validated DTOs to Prisma; if `tsc` rejects it, narrow by spreading explicit fields instead.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-api test -- admin-announcements.service.spec`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/admin-announcements.service.ts apps/api/src/modules/admin/admin-announcements.service.spec.ts
git commit -m "feat(admin): announcements service with derived counts"
```

### Task 12: AdminAnnouncementsController + module wiring

**Files:**
- Create: `apps/api/src/modules/admin/admin-announcements.controller.ts`
- Modify: `apps/api/src/modules/admin/admin.module.ts`

- [ ] **Step 1: Write the controller** (mirrors `admin-tickets.controller.ts`; adds the assets endpoint):

```ts
// apps/api/src/modules/admin/admin-announcements.controller.ts
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LOTTIE_REGISTRY, type AdminAnnouncement, type LottieAsset } from '@finby/shared';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  createAnnouncementSchema,
  updateAnnouncementSchema,
  type CreateAnnouncementInput,
  type UpdateAnnouncementInput,
} from './dto/admin.schemas';
import { AdminAnnouncementsService } from './admin-announcements.service';
import { AdminJwtGuard } from './guards/admin-jwt.guard';

@Throttle({ global: { limit: 60, ttl: 60_000 } })
@Public()
@UseGuards(AdminJwtGuard)
@Controller('admin/announcements')
export class AdminAnnouncementsController {
  constructor(private readonly service: AdminAnnouncementsService) {}

  @Get()
  list(): Promise<AdminAnnouncement[]> {
    return this.service.list();
  }

  @Get('assets')
  assets(): { lottie: LottieAsset[] } {
    return { lottie: [...LOTTIE_REGISTRY] };
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createAnnouncementSchema)) body: CreateAnnouncementInput,
  ): Promise<AdminAnnouncement> {
    return this.service.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAnnouncementSchema)) body: UpdateAnnouncementInput,
  ): Promise<AdminAnnouncement> {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.service.delete(id);
  }
}
```

> Route order: `@Get('assets')` is declared before `@Get(':id')` would be — there is no `:id` GET here, so no conflict. Keep `assets` static route above any future param route.

- [ ] **Step 2: Register in admin.module**

In `apps/api/src/modules/admin/admin.module.ts`: import `AdminAnnouncementsController` and `AdminAnnouncementsService`, add the controller to `controllers`, and the service to `providers`.

- [ ] **Step 3: Verify build**

Run: `pnpm --filter finby-api build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/admin/admin-announcements.controller.ts apps/api/src/modules/admin/admin.module.ts
git commit -m "feat(admin): announcements CRUD + assets endpoints"
```

---

## Phase F — Web refactor

### Task 13: Web announcements API client + mapper (TDD)

**Files:**
- Modify: `apps/web/src/lib/announcements.ts` (delete array + `pickAnnouncement`, keep interface)
- Delete: `apps/web/src/lib/announcements.test.ts`
- Create: `apps/web/src/lib/announcements-api.ts`
- Test: `apps/web/src/lib/announcements-api.test.ts`

- [ ] **Step 1: Trim `announcements.ts`** to just the interface (remove `ANNOUNCEMENTS` and `pickAnnouncement`):

```ts
// apps/web/src/lib/announcements.ts
/** In-app announcement shape used by the modal. Sourced from the API
 *  (mapped in announcements-api.ts); illustration priority: lottie > image > emoji. */
export type AnnouncementMode = 'simple' | 'steps';
export type AnnouncementPrimaryKind = 'dismiss' | 'enable-push';

export interface AnnouncementStep {
  label: string;
  caption: string;
}

export interface Announcement {
  id: string;
  mode: AnnouncementMode;
  title: string;
  body: string;
  emoji?: string;
  image?: string;
  lottie?: string;
  hashtag?: string;
  confetti?: boolean;
  steps?: AnnouncementStep[];
  primary: { label: string; kind: AnnouncementPrimaryKind };
  expiresAt?: string;
}
```

- [ ] **Step 2: Delete the obsolete test**

Run: `git rm apps/web/src/lib/announcements.test.ts`

- [ ] **Step 3: Write the failing mapper test**

```ts
// apps/web/src/lib/announcements-api.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AnnouncementView } from '@finby/shared';

const authed = vi.fn();
vi.mock('./store', () => ({ useAuth: { getState: () => ({ authed }) } }));

import { getActiveAnnouncement, markDismissed, markSeen } from './announcements-api';

const view: AnnouncementView = {
  id: 'an1', mode: 'STEPS', title: 'Turn on notifications', body: 'b',
  emoji: '🔔', imageUrl: null, lottieKey: 'notif-bell', hashtag: 'Stay on track',
  confetti: false, steps: [{ label: 'Tap', caption: 'cap' }],
  primaryLabel: 'Turn on notifications', primaryKind: 'ENABLE_PUSH', expiresAt: null,
};

describe('announcements-api', () => {
  beforeEach(() => authed.mockReset());

  it('maps the API view onto the modal Announcement shape (lottie path resolved)', async () => {
    authed.mockResolvedValue({ announcement: view });
    const result = await getActiveAnnouncement();
    expect(authed).toHaveBeenCalledWith('/announcements/active');
    expect(result).toEqual({
      id: 'an1', mode: 'steps', title: 'Turn on notifications', body: 'b',
      emoji: '🔔', image: undefined, lottie: '/lottie/notif-bell.json', hashtag: 'Stay on track',
      confetti: false, steps: [{ label: 'Tap', caption: 'cap' }],
      primary: { label: 'Turn on notifications', kind: 'enable-push' }, expiresAt: undefined,
    });
  });

  it('returns null when there is no active announcement', async () => {
    authed.mockResolvedValue({ announcement: null });
    expect(await getActiveAnnouncement()).toBeNull();
  });

  it('markSeen and markDismissed POST to the right endpoints', async () => {
    authed.mockResolvedValue(undefined);
    await markSeen('an1');
    await markDismissed('an1');
    expect(authed).toHaveBeenCalledWith('/announcements/an1/seen', { method: 'POST' });
    expect(authed).toHaveBeenCalledWith('/announcements/an1/dismiss', { method: 'POST' });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter finby-web test -- announcements-api`
Expected: FAIL — cannot find module `./announcements-api`.

- [ ] **Step 5: Write the implementation**

```ts
// apps/web/src/lib/announcements-api.ts
import { lottiePathForKey, type AnnouncementView } from '@finby/shared';
import { useAuth } from './store';
import type { Announcement } from './announcements';

function authed<T>(path: string, init?: RequestInit): Promise<T> {
  return useAuth.getState().authed<T>(path, init);
}

/** Map the server view onto the presentational Announcement the modal expects. */
function toAnnouncement(v: AnnouncementView): Announcement {
  return {
    id: v.id,
    mode: v.mode === 'STEPS' ? 'steps' : 'simple',
    title: v.title,
    body: v.body,
    emoji: v.emoji ?? undefined,
    image: v.imageUrl ?? undefined,
    lottie: lottiePathForKey(v.lottieKey) ?? undefined,
    hashtag: v.hashtag ?? undefined,
    confetti: v.confetti,
    steps: v.steps ?? undefined,
    primary: {
      label: v.primaryLabel,
      kind: v.primaryKind === 'ENABLE_PUSH' ? 'enable-push' : 'dismiss',
    },
    expiresAt: v.expiresAt ?? undefined,
  };
}

export async function getActiveAnnouncement(): Promise<Announcement | null> {
  const { announcement } = await authed<{ announcement: AnnouncementView | null }>(
    '/announcements/active',
  );
  return announcement ? toAnnouncement(announcement) : null;
}

export function markSeen(id: string): Promise<void> {
  return authed<void>(`/announcements/${id}/seen`, { method: 'POST' });
}

export function markDismissed(id: string): Promise<void> {
  return authed<void>(`/announcements/${id}/dismiss`, { method: 'POST' });
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter finby-web test -- announcements-api`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/announcements.ts apps/web/src/lib/announcements-api.ts apps/web/src/lib/announcements-api.test.ts
git rm apps/web/src/lib/announcements.test.ts
git commit -m "feat(web): fetch announcements from API, map to modal shape"
```

### Task 14: Rewire announcement-host to the API (TDD)

**Files:**
- Modify: `apps/web/src/components/announcements/announcement-host.tsx`
- Rewrite: `apps/web/src/components/announcements/announcement-host.test.tsx`

- [ ] **Step 1: Rewrite the host test**

```tsx
// apps/web/src/components/announcements/announcement-host.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Announcement } from '@/lib/announcements';
import { AnnouncementHost } from './announcement-host';

const getActiveAnnouncement = vi.fn();
const markSeen = vi.fn();
const markDismissed = vi.fn();
vi.mock('@/lib/announcements-api', () => ({
  getActiveAnnouncement: () => getActiveAnnouncement(),
  markSeen: (id: string) => markSeen(id),
  markDismissed: (id: string) => markDismissed(id),
}));

const enablePush = vi.fn();
vi.mock('@/lib/push', () => ({ enablePush: (id: string) => enablePush(id) }));

vi.mock('@/lib/store', () => ({
  useAuth: (sel: (s: unknown) => unknown) =>
    sel({ user: { id: 'u1' }, workspace: { id: 'w1' } }),
}));

const dismissAnn: Announcement = {
  id: 'an1', mode: 'simple', title: 'Streaks are here', body: 'b',
  primary: { label: 'Got it', kind: 'dismiss' },
};
const pushAnn: Announcement = {
  id: 'an2', mode: 'steps', title: 'Turn on notifications', body: 'b',
  steps: [{ label: 'Tap', caption: 'c' }],
  primary: { label: 'Turn on notifications', kind: 'enable-push' },
};

describe('AnnouncementHost', () => {
  beforeEach(() => {
    getActiveAnnouncement.mockReset();
    markSeen.mockReset().mockResolvedValue(undefined);
    markDismissed.mockReset().mockResolvedValue(undefined);
    enablePush.mockReset().mockResolvedValue(undefined);
  });

  it('renders the active announcement and records an impression', async () => {
    getActiveAnnouncement.mockResolvedValue(dismissAnn);
    render(<AnnouncementHost />);
    expect(await screen.findByText('Streaks are here')).toBeInTheDocument();
    await waitFor(() => expect(markSeen).toHaveBeenCalledWith('an1'));
  });

  it('renders nothing when there is no active announcement', async () => {
    getActiveAnnouncement.mockResolvedValue(null);
    const { container } = render(<AnnouncementHost />);
    await waitFor(() => expect(getActiveAnnouncement).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('persists dismissal on the primary "Got it" action and closes', async () => {
    getActiveAnnouncement.mockResolvedValue(dismissAnn);
    render(<AnnouncementHost />);
    await userEvent.click(await screen.findByRole('button', { name: 'Got it' }));
    expect(markDismissed).toHaveBeenCalledWith('an1');
    await waitFor(() => expect(screen.queryByText('Streaks are here')).not.toBeInTheDocument());
  });

  it('runs enablePush then dismisses for the enable-push CTA', async () => {
    getActiveAnnouncement.mockResolvedValue(pushAnn);
    render(<AnnouncementHost />);
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on notifications' }));
    expect(enablePush).toHaveBeenCalledWith('w1');
    await waitFor(() => expect(markDismissed).toHaveBeenCalledWith('an2'));
  });

  it('"Remind me later" closes for the session without persisting', async () => {
    getActiveAnnouncement.mockResolvedValue(dismissAnn);
    render(<AnnouncementHost />);
    await userEvent.click(await screen.findByRole('button', { name: /remind me later/i }));
    expect(markDismissed).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('Streaks are here')).not.toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-web test -- announcement-host`
Expected: FAIL — host still imports `ANNOUNCEMENTS`/`pickAnnouncement` / behaviour mismatch.

- [ ] **Step 3: Rewrite the host**

```tsx
// apps/web/src/components/announcements/announcement-host.tsx
'use client';

import { useEffect, useState } from 'react';
import type { Announcement } from '@/lib/announcements';
import { getActiveAnnouncement, markDismissed, markSeen } from '@/lib/announcements-api';
import { enablePush } from '@/lib/push';
import { useAuth } from '@/lib/store';
import { AnnouncementModal } from './announcement-modal';

/** Mounted once in the authed shell. Fetches the single active announcement the
 *  server picks for this user and wires its actions:
 *   - primary 'dismiss'     → persist dismissal (never show again)
 *   - primary 'enable-push' → run the permission prompt, then persist dismissal
 *   - "Remind me later"     → close for this session only (reappears next load) */
export function AnnouncementHost() {
  const workspace = useAuth((s) => s.workspace);

  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stale = false;
    getActiveAnnouncement()
      .then((a) => {
        if (stale || !a) return;
        setAnnouncement(a);
        void markSeen(a.id);
      })
      .catch(() => {
        /* network error — show nothing, never crash the shell */
      });
    return () => {
      stale = true;
    };
  }, []);

  if (!announcement || closed) return null;
  const current = announcement; // non-null in the closures below

  async function handlePrimary() {
    if (current.primary.kind === 'enable-push' && workspace) {
      setBusy(true);
      try {
        await enablePush(workspace.id);
      } catch {
        /* ignore — still dismiss so we don't keep nagging */
      } finally {
        setBusy(false);
      }
    }
    try {
      await markDismissed(current.id);
    } catch {
      /* dismissal persist failed — close locally so the user isn't trapped */
    }
    setClosed(true);
  }

  function handleRemindLater() {
    setClosed(true);
  }

  return (
    <AnnouncementModal
      announcement={current}
      onPrimary={handlePrimary}
      onRemindLater={handleRemindLater}
      busy={busy}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-web test -- announcement-host`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full web announcement suite** (modal test must still pass unchanged)

Run: `pnpm --filter finby-web test -- announcements`
Expected: PASS — modal, host, and api tests green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/announcements/announcement-host.tsx apps/web/src/components/announcements/announcement-host.test.tsx
git commit -m "feat(web): drive announcement host from the API"
```

---

## Phase G — Admin dashboard UI

### Task 15: Admin API client methods

**Files:**
- Modify: `apps/admin/src/lib/api.ts`

- [ ] **Step 1: Add the methods** inside the `api` object (after `updateTicket`):

```ts
  announcements: () =>
    request<import('@finby/shared').AdminAnnouncement[]>('/admin/announcements'),
  announcementAssets: () =>
    request<{ lottie: import('@finby/shared').LottieAsset[] }>('/admin/announcements/assets'),
  createAnnouncement: (body: import('@finby/shared').AdminAnnouncementInput) =>
    request<import('@finby/shared').AdminAnnouncement>('/admin/announcements', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateAnnouncement: (id: string, body: Partial<import('@finby/shared').AdminAnnouncementInput>) =>
    request<import('@finby/shared').AdminAnnouncement>(`/admin/announcements/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteAnnouncement: (id: string) =>
    request<void>(`/admin/announcements/${id}`, { method: 'DELETE' }),
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/lib/api.ts
git commit -m "feat(admin-web): announcement API client methods"
```

### Task 16: Toggle UI component (TDD)

**Files:**
- Create: `apps/admin/src/components/ui/toggle.tsx`
- Test: `apps/admin/src/components/ui/toggle.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/admin/src/components/ui/toggle.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Toggle } from './toggle';

describe('Toggle', () => {
  it('renders a switch reflecting the checked state and toggles on click', async () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Confetti" />);
    const sw = screen.getByRole('switch', { name: 'Confetti' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-admin test -- toggle`
Expected: FAIL — cannot find module `./toggle`.

- [ ] **Step 3: Write the component** (non-native, per Finby UI rule):

```tsx
// apps/admin/src/components/ui/toggle.tsx
'use client';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  id?: string;
  disabled?: boolean;
}

/** Accessible on/off switch. Replaces native <input type="checkbox">. */
export function Toggle({ checked, onChange, label, id, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
        checked ? 'bg-accent' : 'bg-line'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-admin test -- toggle`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/components/ui/toggle.tsx apps/admin/src/components/ui/toggle.test.tsx
git commit -m "feat(admin-web): non-native Toggle component"
```

### Task 17: AnnouncementForm (TDD)

**Files:**
- Create: `apps/admin/src/components/AnnouncementForm.tsx`
- Test: `apps/admin/src/components/AnnouncementForm.test.tsx`

> **Lottie preview note:** the admin app has no Lottie renderer dependency. The picker is a `Dropdown` of registry options (label only) — no animated preview — to avoid adding `lottie-web` to the admin bundle. The spec's "live preview" is intentionally descoped here; revisit if a renderer is later added.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/admin/src/components/AnnouncementForm.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { LottieAsset } from '@finby/shared';
import { AnnouncementForm } from './AnnouncementForm';

const assets: LottieAsset[] = [{ key: 'streak-flame', label: 'Streak flame', path: '/lottie/streak-flame.json' }];

describe('AnnouncementForm', () => {
  it('blocks submit until required key/title/body are filled', async () => {
    const onSubmit = vi.fn();
    render(<AnnouncementForm assets={assets} onSubmit={onSubmit} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/key is required/i)).toBeInTheDocument();
  });

  it('submits a well-formed payload with defaults', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AnnouncementForm assets={assets} onSubmit={onSubmit} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/^key$/i), 'spring-sale-2026');
    await userEvent.type(screen.getByLabelText(/^title$/i), 'Spring sale');
    await userEvent.type(screen.getByLabelText(/^body$/i), 'Save big this spring');
    await userEvent.type(screen.getByLabelText(/primary button label/i), 'See deals');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'spring-sale-2026', title: 'Spring sale', body: 'Save big this spring',
        primaryLabel: 'See deals', status: 'DRAFT', mode: 'SIMPLE',
        primaryKind: 'DISMISS', confetti: false, order: 0,
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-admin test -- AnnouncementForm`
Expected: FAIL — cannot find module `./AnnouncementForm`.

- [ ] **Step 3: Write the component**

```tsx
// apps/admin/src/components/AnnouncementForm.tsx
'use client';

import { useState } from 'react';
import type { AdminAnnouncement, AdminAnnouncementInput, AnnouncementStepView, LottieAsset } from '@finby/shared';
import { Button } from './ui/button';
import { Dropdown } from './ui/dropdown';
import { Field } from './ui/field';
import { Input } from './ui/input';
import { Toggle } from './ui/toggle';

interface Props {
  assets: LottieAsset[];
  initial?: AdminAnnouncement;
  onSubmit: (input: AdminAnnouncementInput) => Promise<void>;
  onCancel: () => void;
}

const MODE_OPTS = [{ value: 'SIMPLE', label: 'Simple' }, { value: 'STEPS', label: 'Steps' }];
const STATUS_OPTS = [{ value: 'DRAFT', label: 'Draft' }, { value: 'PUBLISHED', label: 'Published' }];
const KIND_OPTS = [{ value: 'DISMISS', label: 'Dismiss' }, { value: 'ENABLE_PUSH', label: 'Enable push' }];
const TIER_OPTS = [
  { value: '', label: 'Everyone' }, { value: 'FREE', label: 'Free' }, { value: 'PRO', label: 'Pro' },
  { value: 'PREMIUM', label: 'Premium' }, { value: 'FAMILY', label: 'Family' },
];

export function AnnouncementForm({ assets, initial, onSubmit, onCancel }: Props) {
  const [key, setKey] = useState(initial?.key ?? '');
  const [status, setStatus] = useState<AdminAnnouncementInput['status']>(initial?.status ?? 'DRAFT');
  const [mode, setMode] = useState<AdminAnnouncementInput['mode']>(initial?.mode ?? 'SIMPLE');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? '');
  const [lottieKey, setLottieKey] = useState(initial?.lottieKey ?? '');
  const [hashtag, setHashtag] = useState(initial?.hashtag ?? '');
  const [confetti, setConfetti] = useState(initial?.confetti ?? false);
  const [steps, setSteps] = useState<AnnouncementStepView[]>(initial?.steps ?? []);
  const [primaryLabel, setPrimaryLabel] = useState(initial?.primaryLabel ?? '');
  const [primaryKind, setPrimaryKind] = useState<AdminAnnouncementInput['primaryKind']>(initial?.primaryKind ?? 'DISMISS');
  const [targetTier, setTargetTier] = useState<string>(initial?.targetTier ?? '');
  const [order, setOrder] = useState(String(initial?.order ?? 0));
  const [publishAt, setPublishAt] = useState(initial?.publishAt ?? '');
  const [expiresAt, setExpiresAt] = useState(initial?.expiresAt ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const lottieOpts = [{ value: '', label: 'None' }, ...assets.map((a) => ({ value: a.key, label: a.label }))];

  function setStep(i: number, patch: Partial<AnnouncementStepView>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function handleSave() {
    if (!key.trim()) return setError('Key is required');
    if (!title.trim()) return setError('Title is required');
    if (!body.trim()) return setError('Body is required');
    if (!primaryLabel.trim()) return setError('Primary button label is required');
    setError('');
    setBusy(true);
    try {
      await onSubmit({
        key: key.trim(), status, mode, title: title.trim(), body: body.trim(),
        emoji: emoji.trim() || null,
        lottieKey: lottieKey || null,
        hashtag: hashtag.trim() || null,
        confetti,
        steps: mode === 'STEPS' ? steps : null,
        primaryLabel: primaryLabel.trim(), primaryKind,
        targetTier: targetTier ? (targetTier as AdminAnnouncementInput['targetTier']) : null,
        order: Number(order) || 0,
        publishAt: publishAt.trim() || null,
        expiresAt: expiresAt.trim() || null,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-danger">{error}</p>}
      <Field label="Key"><Input aria-label="Key" value={key} onChange={(e) => setKey(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Status"><Dropdown aria-label="Status" value={status} options={STATUS_OPTS} onChange={(v) => setStatus(v as AdminAnnouncementInput['status'])} /></Field>
        <Field label="Mode"><Dropdown aria-label="Mode" value={mode} options={MODE_OPTS} onChange={(v) => setMode(v as AdminAnnouncementInput['mode'])} /></Field>
      </div>
      <Field label="Title"><Input aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Body"><Input aria-label="Body" value={body} onChange={(e) => setBody(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Emoji"><Input aria-label="Emoji" value={emoji} onChange={(e) => setEmoji(e.target.value)} /></Field>
        <Field label="Hashtag"><Input aria-label="Hashtag" value={hashtag} onChange={(e) => setHashtag(e.target.value)} /></Field>
      </div>
      <Field label="Lottie animation"><Dropdown aria-label="Lottie animation" value={lottieKey} options={lottieOpts} onChange={setLottieKey} /></Field>
      <div className="flex items-center gap-3">
        <Toggle checked={confetti} onChange={setConfetti} label="Confetti" />
        <span className="text-sm text-muted">Confetti burst on open</span>
      </div>
      {mode === 'STEPS' && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-ink">Steps</p>
          {steps.map((s, i) => (
            <div key={i} className="grid grid-cols-2 gap-2">
              <Input aria-label={`Step ${i + 1} label`} value={s.label} onChange={(e) => setStep(i, { label: e.target.value })} />
              <div className="flex gap-2">
                <Input aria-label={`Step ${i + 1} caption`} value={s.caption} onChange={(e) => setStep(i, { caption: e.target.value })} />
                <Button variant="ghost" onClick={() => setSteps((p) => p.filter((_, idx) => idx !== i))}>Remove</Button>
              </div>
            </div>
          ))}
          <Button variant="ghost" onClick={() => setSteps((p) => [...p, { label: '', caption: '' }])}>Add step</Button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Primary button label"><Input aria-label="Primary button label" value={primaryLabel} onChange={(e) => setPrimaryLabel(e.target.value)} /></Field>
        <Field label="Primary action"><Dropdown aria-label="Primary action" value={primaryKind} options={KIND_OPTS} onChange={(v) => setPrimaryKind(v as AdminAnnouncementInput['primaryKind'])} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Target tier"><Dropdown aria-label="Target tier" value={targetTier} options={TIER_OPTS} onChange={setTargetTier} /></Field>
        <Field label="Order"><Input aria-label="Order" value={order} onChange={(e) => setOrder(e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Publish at (ISO, optional)"><Input aria-label="Publish at" placeholder="2026-07-01T00:00:00Z" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} /></Field>
        <Field label="Expires at (ISO, optional)"><Input aria-label="Expires at" placeholder="2026-08-01T00:00:00Z" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave} loading={busy}>Save</Button>
      </div>
    </div>
  );
}
```

> Confirm `Field` accepts a `label` prop and renders it as a `<label>` tied to the control (check `apps/admin/src/components/ui/field.tsx`). The tests target controls by `aria-label`, so they pass regardless; align `Field`'s API if it differs. Confirm `Button` exposes a `loading` prop (it does — used across the admin app).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-admin test -- AnnouncementForm`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/components/AnnouncementForm.tsx apps/admin/src/components/AnnouncementForm.test.tsx
git commit -m "feat(admin-web): announcement editor form"
```

### Task 18: AnnouncementsTable (TDD)

**Files:**
- Create: `apps/admin/src/components/AnnouncementsTable.tsx`
- Test: `apps/admin/src/components/AnnouncementsTable.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/admin/src/components/AnnouncementsTable.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AdminAnnouncement } from '@finby/shared';
import { AnnouncementsTable } from './AnnouncementsTable';

const announcements = vi.fn();
const announcementAssets = vi.fn();
const deleteAnnouncement = vi.fn();
vi.mock('../lib/api', () => ({
  api: {
    announcements: () => announcements(),
    announcementAssets: () => announcementAssets(),
    deleteAnnouncement: (id: string) => deleteAnnouncement(id),
    createAnnouncement: vi.fn(),
    updateAnnouncement: vi.fn(),
  },
}));

const row: AdminAnnouncement = {
  id: 'an1', key: 'streaks-2026-06', status: 'PUBLISHED', mode: 'SIMPLE',
  title: 'Streaks are here', body: 'b', emoji: '🔥', imageUrl: null, lottieKey: 'streak-flame',
  hashtag: 'New', confetti: true, steps: null, primaryLabel: 'Got it', primaryKind: 'DISMISS',
  targetTier: null, order: 0, publishAt: null, expiresAt: null,
  createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z',
  seenCount: 1240, dismissedCount: 880,
};

describe('AnnouncementsTable', () => {
  beforeEach(() => {
    announcements.mockReset().mockResolvedValue([row]);
    announcementAssets.mockReset().mockResolvedValue({ lottie: [] });
    deleteAnnouncement.mockReset().mockResolvedValue(undefined);
  });

  it('renders rows with title, status, and seen/dismissed counts', async () => {
    render(<AnnouncementsTable />);
    expect(await screen.findByText('Streaks are here')).toBeInTheDocument();
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText(/1240/)).toBeInTheDocument();
    expect(screen.getByText(/880/)).toBeInTheDocument();
  });

  it('deletes a row after confirmation and refetches', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<AnnouncementsTable />);
    await screen.findByText('Streaks are here');
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(deleteAnnouncement).toHaveBeenCalledWith('an1');
    await waitFor(() => expect(announcements).toHaveBeenCalledTimes(2));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-admin test -- AnnouncementsTable`
Expected: FAIL — cannot find module `./AnnouncementsTable`.

- [ ] **Step 3: Write the component**

```tsx
// apps/admin/src/components/AnnouncementsTable.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminAnnouncement, AdminAnnouncementInput, LottieAsset } from '@finby/shared';
import { api } from '../lib/api';
import { AnnouncementForm } from './AnnouncementForm';
import { Button } from './ui/button';

function StatusPill({ status }: { status: AdminAnnouncement['status'] }) {
  const published = status === 'PUBLISHED';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${published ? 'bg-accent-soft text-accent' : 'bg-line text-muted'}`}>
      {published ? 'Published' : 'Draft'}
    </span>
  );
}

export function AnnouncementsTable() {
  const [rows, setRows] = useState<AdminAnnouncement[] | null>(null);
  const [assets, setAssets] = useState<LottieAsset[]>([]);
  const [err, setErr] = useState(false);
  const [editing, setEditing] = useState<AdminAnnouncement | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api.announcements().then(setRows).catch(() => setErr(true));
  }, []);

  useEffect(() => {
    load();
    api.announcementAssets().then((d) => setAssets(d.lottie)).catch(() => undefined);
  }, [load]);

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this announcement? This cannot be undone.')) return;
    await api.deleteAnnouncement(id);
    load();
  }

  async function handleSubmit(input: AdminAnnouncementInput) {
    if (editing) await api.updateAnnouncement(editing.id, input);
    else await api.createAnnouncement(input);
    setEditing(null);
    setCreating(false);
    load();
  }

  if (editing || creating) {
    return (
      <AnnouncementForm
        assets={assets}
        initial={editing ?? undefined}
        onSubmit={handleSubmit}
        onCancel={() => {
          setEditing(null);
          setCreating(false);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold text-ink">Announcements</h1>
        <Button onClick={() => setCreating(true)}>New announcement</Button>
      </div>
      {err && <p className="text-sm text-danger">Failed to load announcements.</p>}
      {rows === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Engagement</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{a.title}</div>
                    <div className="text-xs text-muted">{a.key}</div>
                  </td>
                  <td className="px-4 py-3"><StatusPill status={a.status} /></td>
                  <td className="px-4 py-3">{a.targetTier ?? 'Everyone'}</td>
                  <td className="px-4 py-3">{a.order}</td>
                  <td className="px-4 py-3 text-muted">{a.seenCount} seen · {a.dismissedCount} dismissed</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" className="px-2 py-1" onClick={() => setEditing(a)}>Edit</Button>
                      <Button variant="ghost" className="px-2 py-1" onClick={() => handleDelete(a.id)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

> Verify the `bg-accent-soft` / `text-accent` tokens exist in the admin Tailwind config (they're referenced in the recon). If a token is absent, substitute an existing one from `tailwind.config.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-admin test -- AnnouncementsTable`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/components/AnnouncementsTable.tsx apps/admin/src/components/AnnouncementsTable.test.tsx
git commit -m "feat(admin-web): announcements management table"
```

### Task 19: Page route + nav link

**Files:**
- Create: `apps/admin/src/app/announcements/page.tsx`
- Modify: `apps/admin/src/components/AdminShell.tsx`

- [ ] **Step 1: Create the page** (mirror an existing page like `app/tickets/page.tsx` for the `AuthGate` + `AdminShell` wrapping — open it first to match exactly):

```tsx
// apps/admin/src/app/announcements/page.tsx
import { AuthGate } from '../../components/AuthGate';
import { AdminShell } from '../../components/AdminShell';
import { AnnouncementsTable } from '../../components/AnnouncementsTable';

export default function AnnouncementsPage() {
  return (
    <AuthGate>
      <AdminShell>
        <AnnouncementsTable />
      </AdminShell>
    </AuthGate>
  );
}
```

> If `app/tickets/page.tsx` wraps differently (e.g. `AuthGate` inside `AdminShell`, or a `'use client'` directive), copy that exact structure instead of the above.

- [ ] **Step 2: Add the nav link.** In `apps/admin/src/components/AdminShell.tsx`, add to the `NAV` array:

```ts
  { href: '/announcements', label: 'Announcements' },
```

- [ ] **Step 3: Verify build + full admin suite**

Run: `pnpm --filter finby-admin test && pnpm --filter finby-admin build`
Expected: all tests pass; build clean.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/app/announcements/page.tsx apps/admin/src/components/AdminShell.tsx
git commit -m "feat(admin-web): announcements page + nav link"
```

---

## Phase H — Final verification

### Task 20: Full sweep

- [ ] **Step 1: API tests + build**

Run: `pnpm --filter finby-api test && pnpm --filter finby-api build`
Expected: green.

- [ ] **Step 2: Web tests + build**

Run: `pnpm --filter finby-web test && pnpm --filter finby-web build`
Expected: green.

- [ ] **Step 3: Admin tests + build**

Run: `pnpm --filter finby-admin test && pnpm --filter finby-admin build`
Expected: green.

- [ ] **Step 4: Lint all three** (match the repo's lint invocation — e.g. `pnpm -r lint` or per-filter)

Run: `pnpm --filter finby-api lint && pnpm --filter finby-web lint && pnpm --filter finby-admin lint`
Expected: no errors; confirm no `any` introduced.

- [ ] **Step 5: Manual smoke (optional but recommended)**
  - Boot the API; confirm 4 announcements seeded (Prisma Studio).
  - In the admin app: create a Draft, publish it, set `targetTier=PRO`, save.
  - In the web app as a Pro user: confirm it shows; dismiss it; confirm it doesn't return.
  - As a Free user: confirm the Pro-only announcement does not show.

- [ ] **Step 6: Final commit (if any lint/build fixups were needed)**

```bash
git add -A
git commit -m "chore(announcements): lint + build fixups"
```

---

## Spec coverage check

- Admin CRUD from dashboard → Tasks 10–12, 15–19.
- Full content parity (modes, lottie, confetti, steps, dismiss/enable-push) → Tasks 8, 17 (form), 13 (mapping).
- Lifecycle (draft/published, publish+expiry, order) → schema (Task 3), selection (Task 5), form (Task 17).
- Tier targeting → schema + selection (Tasks 3, 5), form (Task 17).
- Impressions + dismissals analytics → interaction tracking (Task 6), derived counts (Task 11), table (Task 18).
- Migrate 4 existing + dismissal continuity → seed (Task 8) + backfill (Task 9).
- Lottie registry → Task 1; web resolves path (Task 13); admin picker (Task 17).
- Web retires hardcoded array, modal untouched → Tasks 13–14.
