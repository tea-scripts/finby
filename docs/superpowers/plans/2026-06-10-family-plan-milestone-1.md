# Family Plan — Milestone 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Family plan usable end-to-end — invite members by email, accept (new & existing users), list members, change roles, remove, leave — with a workspace switcher.

**Architecture:** A new NestJS `members` module exposes workspace-scoped management endpoints (OWNER-gated via the existing `RolesGuard`) plus a public token-based accept flow. A dedicated `WorkspaceInvite` Prisma model holds pending invites so `WorkspaceMember.userId` stays non-nullable. The web app gains a workspace list endpoint + switcher and a Settings members section.

**Tech Stack:** NestJS, Prisma (PostgreSQL), Zod DTOs, Jest (backend), Next.js 15 app router, Zustand, Vitest/Jest (web).

**Spec:** `docs/superpowers/specs/2026-06-10-family-plan-milestone-1-design.md`

**Conventions to follow (read before starting):**
- Service pattern: `apps/api/src/modules/settings/settings.service.ts`
- Service test pattern (plain `new Service(mockPrisma)`, `jest.fn()` mocks): `apps/api/src/modules/settings/settings.service.spec.ts`
- Controller + guards pattern: `apps/api/src/modules/settings/settings.controller.ts`
- Module pattern: `apps/api/src/modules/settings/settings.module.ts`
- Email template/service pattern: `apps/api/src/modules/email/email.templates.ts`, `email.service.ts`
- Token (hash) pattern: `forgotPassword` in `apps/api/src/modules/auth/auth.service.ts`
- Account provisioning pattern: `register` in `apps/api/src/modules/auth/auth.service.ts`
- Web API client pattern: `apps/web/src/lib/billing-api.ts`
- Web store pattern: `apps/web/src/lib/store.ts`
- Web settings section pattern: `apps/web/src/components/settings/refer-section.tsx`

**Roles:** `WorkspaceMemberRole` = `'OWNER' | 'CO_MANAGER' | 'VIEWER'` (exported from `@finby/shared`, used in `apps/api/src/common/context.ts`).

**Build/test commands (run from repo root unless noted):**
- API tests: `cd apps/api && npx jest <path>`
- API build: `npm run build` (root, turbo)
- Lint: `npm run lint`
- Web tests: `cd apps/web && npm test`

---

## Phase A — Data model

### Task 1: Add `WorkspaceInvite` model + `InviteStatus` enum

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add the enum and model**

In `apps/api/prisma/schema.prisma`, add the `InviteStatus` enum near the other enums (e.g. just after the `WorkspaceMemberRole` enum), and the model after the `WorkspaceMember` model (after line ~246):

```prisma
enum InviteStatus {
  PENDING
  ACCEPTED
  REVOKED
  EXPIRED
}

model WorkspaceInvite {
  id              String              @id @default(cuid())
  workspaceId     String
  workspace       Workspace           @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  email           String              // invitee email, stored lowercased
  role            WorkspaceMemberRole @default(VIEWER)
  tokenHash       String              @unique // SHA-256 of raw token; raw is emailed only
  status          InviteStatus        @default(PENDING)
  invitedByUserId String
  expiresAt       DateTime
  acceptedAt      DateTime?
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  @@unique([workspaceId, email]) // at most one live invite per email per workspace
  @@index([workspaceId])
  @@map("workspace_invites")
}
```

- [ ] **Step 2: Add the back-relation to `Workspace`**

In the `Workspace` model's relations block (alongside `members WorkspaceMember[]`, around line 205), add:

```prisma
  invites           WorkspaceInvite[]
```

- [ ] **Step 3: Create the migration**

Run: `cd apps/api && npx prisma migrate dev --name add_workspace_invite`
Expected: a new migration folder under `apps/api/prisma/migrations/`, Prisma Client regenerated, command exits 0.

- [ ] **Step 4: Verify the client typings exist**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json 2>&1 | head -20` (or `npm run build`)
Expected: no errors referencing `WorkspaceInvite` or `InviteStatus`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): add WorkspaceInvite model and InviteStatus enum"
```

---

## Phase B — Email

### Task 2: Invite email template + service method

**Files:**
- Modify: `apps/api/src/modules/email/email.templates.ts`
- Modify: `apps/api/src/modules/email/email.service.ts`
- Test: `apps/api/src/modules/email/email.service.spec.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

Create/extend `apps/api/src/modules/email/email.service.spec.ts`:

```typescript
import { EmailService } from './email.service';
import type { EmailProvider } from './email.provider';

function build() {
  const send = jest.fn().mockResolvedValue(undefined);
  const provider: EmailProvider = { send };
  const service = new EmailService(provider);
  return { service, send };
}

describe('EmailService.sendMemberInvite', () => {
  it('sends an invite email containing the accept URL and inviter/workspace names', async () => {
    const { service, send } = build();
    await service.sendMemberInvite('a@x.com', 'Bola', 'The Johnson Family', 'https://app/invite/tok123');
    expect(send).toHaveBeenCalledTimes(1);
    const msg = send.mock.calls[0][0];
    expect(msg.to).toBe('a@x.com');
    expect(msg.subject).toContain('family');
    expect(msg.html).toContain('https://app/invite/tok123');
    expect(msg.html).toContain('The Johnson Family');
    expect(msg.html).toContain('Bola');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/modules/email/email.service.spec.ts -t sendMemberInvite`
Expected: FAIL — `service.sendMemberInvite is not a function`.

- [ ] **Step 3: Add the template**

In `apps/api/src/modules/email/email.templates.ts`, add (reuse the existing `SHELL`, `button`, `esc` helpers already in the file):

```typescript
export function memberInviteEmail(
  inviterName: string,
  workspaceName: string,
  acceptUrl: string,
): { subject: string; html: string } {
  return {
    subject: `You're invited to a Finby family workspace`,
    html: SHELL(`<h1 style="font-size:20px;margin:0 0 12px;color:#e8eef7;">Join ${esc(workspaceName)}</h1>
      <p style="margin:0 0 22px;line-height:1.5;color:#8da3c0;">${esc(inviterName)} invited you to share their Finby family workspace. Accept to see and help manage your shared finances.</p>
      ${button(acceptUrl, 'Accept invitation')}
      <p style="color:#5b6f8c;font-size:13px;line-height:1.5;margin:22px 0 0;">This invitation expires in 7 days. If you weren't expecting it, you can ignore this email.</p>`),
  };
}
```

- [ ] **Step 4: Add the service method**

In `apps/api/src/modules/email/email.service.ts`, import `memberInviteEmail` (add to the existing import block from `./email.templates`) and add:

```typescript
  async sendMemberInvite(
    to: string,
    inviterName: string,
    workspaceName: string,
    acceptUrl: string,
  ): Promise<void> {
    const { subject, html } = memberInviteEmail(inviterName, workspaceName, acceptUrl);
    await this.provider.send({ to, subject, html });
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && npx jest src/modules/email/email.service.spec.ts -t sendMemberInvite`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/email
git commit -m "feat(email): add family member invite email"
```

---

## Phase C — Backend: DTOs, members service, invites service

### Task 3: DTO schemas for the members module

**Files:**
- Create: `apps/api/src/modules/members/dto/members.schemas.ts`

- [ ] **Step 1: Create the schemas**

```typescript
import { z } from 'zod';

const roleSchema = z.enum(['OWNER', 'CO_MANAGER', 'VIEWER']);

export const createInviteSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  role: z.enum(['CO_MANAGER', 'VIEWER']).default('VIEWER'),
});
export type CreateInviteInput = z.infer<typeof createInviteSchema>;

export const changeRoleSchema = z.object({
  role: roleSchema,
});
export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;

export const acceptSignupSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(200),
  baseCurrency: z.string().trim().length(3).toUpperCase().default('USD'),
  timezone: z.string().trim().min(1).default('UTC'),
});
export type AcceptSignupInput = z.infer<typeof acceptSignupSchema>;
```

(Inviting someone as OWNER is intentionally disallowed — there is exactly one owner, who holds the subscription.)

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json 2>&1 | grep members.schemas || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/members/dto/members.schemas.ts
git commit -m "feat(members): add invite/role DTO schemas"
```

---

### Task 4: `MembersService.inviteMember` (tier + seat + dup checks)

**Files:**
- Create: `apps/api/src/modules/members/members.service.ts`
- Test: `apps/api/src/modules/members/members.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { MembersService } from './members.service';

function buildPrisma(overrides: Record<string, unknown> = {}) {
  return {
    workspace: {
      findUnique: jest.fn().mockResolvedValue({ name: 'The Johnson Family', tier: 'FAMILY', maxMembers: 5 }),
    },
    workspaceMember: {
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    workspaceInvite: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'inv1', ...data }),
      ),
    },
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    ...overrides,
  };
}

function build(prisma = buildPrisma(), email = { sendMemberInvite: jest.fn().mockResolvedValue(undefined) }, config = { get: () => 'https://app' }) {
  const service = new MembersService(prisma as never, email as never, config as never);
  return { service, prisma, email };
}

const INVITER = { userId: 'u1', name: 'Bola' };

describe('MembersService.inviteMember', () => {
  it('rejects when the workspace is not on FAMILY', async () => {
    const prisma = buildPrisma();
    prisma.workspace.findUnique = jest.fn().mockResolvedValue({ name: 'w', tier: 'PRO', maxMembers: 1 });
    const { service } = build(prisma);
    await expect(
      service.inviteMember('ws1', INVITER, { email: 'a@x.com', role: 'VIEWER' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects when seats are full (members + pending invites >= maxMembers)', async () => {
    const prisma = buildPrisma();
    prisma.workspaceMember.count = jest.fn().mockResolvedValue(3);
    prisma.workspaceInvite.count = jest.fn().mockResolvedValue(2); // 3 + 2 = 5 = max
    const { service } = build(prisma);
    await expect(
      service.inviteMember('ws1', INVITER, { email: 'a@x.com', role: 'VIEWER' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects when the email already belongs to a member', async () => {
    const prisma = buildPrisma();
    prisma.user.findUnique = jest.fn().mockResolvedValue({ id: 'u2' });
    prisma.workspaceMember.findFirst = jest.fn().mockResolvedValue({ id: 'm2' });
    const { service } = build(prisma);
    await expect(
      service.inviteMember('ws1', INVITER, { email: 'a@x.com', role: 'VIEWER' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects when a pending invite already exists for the email', async () => {
    const prisma = buildPrisma();
    prisma.workspaceInvite.findFirst = jest.fn().mockResolvedValue({ id: 'inv0' });
    const { service } = build(prisma);
    await expect(
      service.inviteMember('ws1', INVITER, { email: 'a@x.com', role: 'VIEWER' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates a hashed-token invite and sends the email on the happy path', async () => {
    const { service, prisma, email } = build();
    const result = await service.inviteMember('ws1', INVITER, { email: 'a@x.com', role: 'CO_MANAGER' });
    const createArg = prisma.workspaceInvite.create.mock.calls[0][0].data;
    expect(createArg.email).toBe('a@x.com');
    expect(createArg.role).toBe('CO_MANAGER');
    expect(createArg.status).toBe('PENDING');
    expect(createArg.tokenHash).toMatch(/^[a-f0-9]{64}$/); // sha256 hex
    expect(createArg.workspaceId).toBe('ws1');
    expect(createArg.invitedByUserId).toBe('u1');
    expect(email.sendMemberInvite).toHaveBeenCalledTimes(1);
    const acceptUrl = email.sendMemberInvite.mock.calls[0][3];
    expect(acceptUrl).toContain('/invite/'); // raw token in URL, not the hash
    expect(result).toEqual(expect.objectContaining({ id: 'inv1', email: 'a@x.com', role: 'CO_MANAGER' }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/modules/members/members.service.spec.ts -t inviteMember`
Expected: FAIL — cannot find `members.service`.

- [ ] **Step 3: Implement the service**

Create `apps/api/src/modules/members/members.service.ts`:

```typescript
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { Env } from '../../config/env.schema';
import { EmailService } from '../email/email.service';
import type { CreateInviteInput, ChangeRoleInput } from './dto/members.schemas';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface InviteView {
  id: string;
  email: string;
  role: string;
  invitedByUserId: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface MemberView {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  role: string;
  joinedAt: Date;
  isSelf: boolean;
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async inviteMember(
    workspaceId: string,
    inviter: { userId: string; name: string },
    input: CreateInviteInput,
  ): Promise<InviteView> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true, tier: true, maxMembers: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found.');
    if (workspace.tier !== 'FAMILY') {
      throw new ForbiddenException({ error: 'tier_limit', message: 'Inviting members requires the Family plan.' });
    }

    const [memberCount, pendingCount] = await Promise.all([
      this.prisma.workspaceMember.count({ where: { workspaceId } }),
      this.prisma.workspaceInvite.count({ where: { workspaceId, status: 'PENDING' } }),
    ]);
    if (memberCount + pendingCount >= workspace.maxMembers) {
      throw new ConflictException(`Your plan allows up to ${workspace.maxMembers} members.`);
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (existingUser) {
      const member = await this.prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: existingUser.id },
        select: { id: true },
      });
      if (member) throw new ConflictException('That person is already a member of this workspace.');
    }

    const pending = await this.prisma.workspaceInvite.findFirst({
      where: { workspaceId, email: input.email, status: 'PENDING' },
      select: { id: true },
    });
    if (pending) throw new ConflictException('There is already a pending invite for that email.');

    const rawToken = randomBytes(32).toString('hex');
    const invite = await this.prisma.workspaceInvite.create({
      data: {
        workspaceId,
        email: input.email,
        role: input.role,
        tokenHash: hashToken(rawToken),
        status: 'PENDING',
        invitedByUserId: inviter.userId,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });

    const acceptUrl = `${this.config.get('WEB_URL', { infer: true })}/invite/${rawToken}`;
    await this.email.sendMemberInvite(input.email, inviter.name, workspace.name, acceptUrl);

    return this.toInviteView(invite);
  }

  private toInviteView(i: {
    id: string;
    email: string;
    role: string;
    invitedByUserId: string;
    expiresAt: Date;
    createdAt: Date;
  }): InviteView {
    return {
      id: i.id,
      email: i.email,
      role: i.role,
      invitedByUserId: i.invitedByUserId,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
    };
  }
}
```

> **Note:** `BadRequestException` is imported in the service for use by later tasks (change role / remove / leave). If your linter flags it as unused at this step, leave it — Task 6 uses it.

- [ ] **Step 4: Run the test**

Run: `cd apps/api && npx jest src/modules/members/members.service.spec.ts -t inviteMember`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/members/members.service.ts apps/api/src/modules/members/members.service.spec.ts
git commit -m "feat(members): inviteMember with tier/seat/dup checks"
```

---

### Task 5: List members + list invites

**Files:**
- Modify: `apps/api/src/modules/members/members.service.ts`
- Modify: `apps/api/src/modules/members/members.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add to the spec:

```typescript
describe('MembersService.listMembers', () => {
  it('maps members and flags the acting user as self', async () => {
    const prisma = buildPrisma({
      workspaceMember: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'm1', userId: 'u1', role: 'OWNER', joinedAt: new Date('2026-01-01'), user: { displayName: 'Bola', email: 'b@x.com' } },
          { id: 'm2', userId: 'u2', role: 'VIEWER', joinedAt: new Date('2026-02-01'), user: { displayName: 'Ada', email: 'a@x.com' } },
        ]),
      },
    });
    const { service } = build(prisma);
    const members = await service.listMembers('ws1', 'u2');
    expect(members).toHaveLength(2);
    expect(members[0]).toEqual(expect.objectContaining({ id: 'm1', displayName: 'Bola', role: 'OWNER', isSelf: false }));
    expect(members[1]).toEqual(expect.objectContaining({ id: 'm2', displayName: 'Ada', isSelf: true }));
  });
});

describe('MembersService.listInvites', () => {
  it('returns pending invites mapped to views', async () => {
    const prisma = buildPrisma({
      workspaceInvite: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'inv1', email: 'a@x.com', role: 'VIEWER', invitedByUserId: 'u1', expiresAt: new Date(), createdAt: new Date() },
        ]),
      },
    });
    const { service } = build(prisma);
    const invites = await service.listInvites('ws1');
    expect(invites).toEqual([expect.objectContaining({ id: 'inv1', email: 'a@x.com', role: 'VIEWER' })]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && npx jest src/modules/members/members.service.spec.ts -t "listMembers|listInvites"`
Expected: FAIL — methods undefined.

- [ ] **Step 3: Implement**

Add to `MembersService`:

```typescript
  async listMembers(workspaceId: string, currentUserId: string): Promise<MemberView[]> {
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      orderBy: { joinedAt: 'asc' },
      select: {
        id: true,
        userId: true,
        role: true,
        joinedAt: true,
        user: { select: { displayName: true, email: true } },
      },
    });
    return members.map((m) => ({
      id: m.id,
      userId: m.userId,
      displayName: m.user.displayName,
      email: m.user.email,
      role: m.role,
      joinedAt: m.joinedAt,
      isSelf: m.userId === currentUserId,
    }));
  }

  async listInvites(workspaceId: string): Promise<InviteView[]> {
    const invites = await this.prisma.workspaceInvite.findMany({
      where: { workspaceId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    return invites.map((i) => this.toInviteView(i));
  }
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/api && npx jest src/modules/members/members.service.spec.ts -t "listMembers|listInvites"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/members/members.service.ts apps/api/src/modules/members/members.service.spec.ts
git commit -m "feat(members): list members and pending invites"
```

---

### Task 6: Change role, remove member, leave (owner protection)

**Files:**
- Modify: `apps/api/src/modules/members/members.service.ts`
- Modify: `apps/api/src/modules/members/members.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
describe('MembersService.changeRole', () => {
  it('rejects changing an OWNER role', async () => {
    const prisma = buildPrisma({
      workspaceMember: { findFirst: jest.fn().mockResolvedValue({ id: 'm1', role: 'OWNER', userId: 'u1' }) },
    });
    const { service } = build(prisma);
    await expect(service.changeRole('ws1', 'm1', { role: 'VIEWER' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates a non-owner member role', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'm2', role: 'CO_MANAGER' });
    const prisma = buildPrisma({
      workspaceMember: {
        findFirst: jest.fn().mockResolvedValue({ id: 'm2', role: 'VIEWER', userId: 'u2' }),
        update,
      },
    });
    const { service } = build(prisma);
    await service.changeRole('ws1', 'm2', { role: 'CO_MANAGER' });
    expect(update).toHaveBeenCalledWith({ where: { id: 'm2' }, data: { role: 'CO_MANAGER' } });
  });

  it('404s for a member not in the workspace', async () => {
    const prisma = buildPrisma({ workspaceMember: { findFirst: jest.fn().mockResolvedValue(null) } });
    const { service } = build(prisma);
    await expect(service.changeRole('ws1', 'mX', { role: 'VIEWER' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('MembersService.removeMember', () => {
  it('rejects removing an OWNER', async () => {
    const prisma = buildPrisma({
      workspaceMember: { findFirst: jest.fn().mockResolvedValue({ id: 'm1', role: 'OWNER', userId: 'u1' }) },
    });
    const { service } = build(prisma);
    await expect(service.removeMember('ws1', 'm1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deletes a non-owner member', async () => {
    const del = jest.fn().mockResolvedValue({});
    const prisma = buildPrisma({
      workspaceMember: {
        findFirst: jest.fn().mockResolvedValue({ id: 'm2', role: 'VIEWER', userId: 'u2' }),
        delete: del,
      },
    });
    const { service } = build(prisma);
    await service.removeMember('ws1', 'm2');
    expect(del).toHaveBeenCalledWith({ where: { id: 'm2' } });
  });
});

describe('MembersService.leave', () => {
  it('rejects when the leaver is the OWNER', async () => {
    const prisma = buildPrisma({
      workspaceMember: { findFirst: jest.fn().mockResolvedValue({ id: 'm1', role: 'OWNER', userId: 'u1' }) },
    });
    const { service } = build(prisma);
    await expect(service.leave('ws1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deletes the leaver membership for a non-owner', async () => {
    const del = jest.fn().mockResolvedValue({});
    const prisma = buildPrisma({
      workspaceMember: {
        findFirst: jest.fn().mockResolvedValue({ id: 'm2', role: 'VIEWER', userId: 'u2' }),
        delete: del,
      },
    });
    const { service } = build(prisma);
    await service.leave('ws1', 'u2');
    expect(del).toHaveBeenCalledWith({ where: { id: 'm2' } });
  });
});
```

Add `NotFoundException` to the spec's import from `@nestjs/common`.

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && npx jest src/modules/members/members.service.spec.ts -t "changeRole|removeMember|leave"`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add to `MembersService`:

```typescript
  async changeRole(workspaceId: string, memberId: string, input: ChangeRoleInput): Promise<MemberView> {
    const member = await this.prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId },
      select: { id: true, role: true, userId: true },
    });
    if (!member) throw new NotFoundException('Member not found.');
    if (member.role === 'OWNER') throw new BadRequestException("The owner's role cannot be changed.");
    if (input.role === 'OWNER') throw new BadRequestException('Ownership cannot be transferred here.');
    await this.prisma.workspaceMember.update({ where: { id: memberId }, data: { role: input.role } });
    return this.requireMemberView(workspaceId, memberId, member.userId);
  }

  async removeMember(workspaceId: string, memberId: string): Promise<void> {
    const member = await this.prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId },
      select: { id: true, role: true },
    });
    if (!member) throw new NotFoundException('Member not found.');
    if (member.role === 'OWNER') {
      throw new BadRequestException('The owner cannot be removed. Cancel the Family subscription instead.');
    }
    await this.prisma.workspaceMember.delete({ where: { id: memberId } });
  }

  async leave(workspaceId: string, currentUserId: string): Promise<void> {
    const member = await this.prisma.workspaceMember.findFirst({
      where: { workspaceId, userId: currentUserId },
      select: { id: true, role: true },
    });
    if (!member) throw new NotFoundException('You are not a member of this workspace.');
    if (member.role === 'OWNER') {
      throw new BadRequestException('The owner cannot leave. Cancel the Family subscription instead.');
    }
    await this.prisma.workspaceMember.delete({ where: { id: member.id } });
  }

  private async requireMemberView(workspaceId: string, memberId: string, currentUserId: string): Promise<MemberView> {
    const found = (await this.listMembers(workspaceId, currentUserId)).find((m) => m.id === memberId);
    if (!found) throw new NotFoundException('Member not found.');
    return found;
  }
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/api && npx jest src/modules/members/members.service.spec.ts`
Expected: PASS (whole file).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/members/members.service.ts apps/api/src/modules/members/members.service.spec.ts
git commit -m "feat(members): change role, remove, and leave with owner protection"
```

---

### Task 7: Cancel + resend invite

**Files:**
- Modify: `apps/api/src/modules/members/members.service.ts`
- Modify: `apps/api/src/modules/members/members.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
describe('MembersService.cancelInvite', () => {
  it('marks a pending invite REVOKED', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = buildPrisma({ workspaceInvite: { updateMany } });
    const { service } = build(prisma);
    await service.cancelInvite('ws1', 'inv1');
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'inv1', workspaceId: 'ws1', status: 'PENDING' },
      data: { status: 'REVOKED' },
    });
  });

  it('404s when no pending invite matched', async () => {
    const prisma = buildPrisma({ workspaceInvite: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } });
    const { service } = build(prisma);
    await expect(service.cancelInvite('ws1', 'invX')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('MembersService.resendInvite', () => {
  it('regenerates the token + expiry and re-sends the email', async () => {
    const prisma = buildPrisma({
      workspace: { findUnique: jest.fn().mockResolvedValue({ name: 'Fam', tier: 'FAMILY', maxMembers: 5 }) },
      workspaceInvite: {
        findFirst: jest.fn().mockResolvedValue({ id: 'inv1', email: 'a@x.com', role: 'VIEWER', status: 'PENDING' }),
        update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'inv1', email: 'a@x.com', role: 'VIEWER', invitedByUserId: 'u1', expiresAt: new Date(), createdAt: new Date(), ...data })),
      },
    });
    const { service, email } = build(prisma);
    await service.resendInvite('ws1', 'inv1', 'Bola');
    const data = prisma.workspaceInvite.update.mock.calls[0][0].data;
    expect(data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(data.expiresAt).toBeInstanceOf(Date);
    expect(email.sendMemberInvite).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && npx jest src/modules/members/members.service.spec.ts -t "cancelInvite|resendInvite"`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add to `MembersService`:

```typescript
  async cancelInvite(workspaceId: string, inviteId: string): Promise<void> {
    const res = await this.prisma.workspaceInvite.updateMany({
      where: { id: inviteId, workspaceId, status: 'PENDING' },
      data: { status: 'REVOKED' },
    });
    if (res.count === 0) throw new NotFoundException('Pending invite not found.');
  }

  async resendInvite(workspaceId: string, inviteId: string, inviterName: string): Promise<InviteView> {
    const invite = await this.prisma.workspaceInvite.findFirst({
      where: { id: inviteId, workspaceId, status: 'PENDING' },
      select: { id: true, email: true, role: true },
    });
    if (!invite) throw new NotFoundException('Pending invite not found.');
    const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } });
    if (!workspace) throw new NotFoundException('Workspace not found.');

    const rawToken = randomBytes(32).toString('hex');
    const updated = await this.prisma.workspaceInvite.update({
      where: { id: inviteId },
      data: { tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
    });
    const acceptUrl = `${this.config.get('WEB_URL', { infer: true })}/invite/${rawToken}`;
    await this.email.sendMemberInvite(invite.email, inviterName, workspace.name, acceptUrl);
    return this.toInviteView(updated);
  }
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/api && npx jest src/modules/members/members.service.spec.ts`
Expected: PASS (whole file).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/members/members.service.ts apps/api/src/modules/members/members.service.spec.ts
git commit -m "feat(members): cancel and resend pending invites"
```

---

### Task 8: `AuthService.provisionInvitedUser` (reusable account creation)

**Files:**
- Modify: `apps/api/src/modules/auth/auth.service.ts`
- Modify: `apps/api/src/modules/auth/auth.service.spec.ts`

**Why:** the new-user accept path must create a user + personal workspace exactly like `register`. Keep that logic in `AuthService` (single source of truth) and expose a method the invites service can call.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/modules/auth/auth.service.spec.ts` (follow the existing mock setup in that file):

```typescript
describe('AuthService.provisionInvitedUser', () => {
  it('creates a user + personal workspace and returns tokens', async () => {
    // Reuse the existing test harness in this file that mocks prisma.$transaction,
    // user.create, workspace.create, workspaceMember.create, and jwt signing.
    // Assert it returns { user, accessToken, refreshToken } and created exactly one workspace.
    // (Mirror the assertions already used by the register() test.)
  });
});
```

> **Implementer note:** copy the mock arrangement from the existing `register` test in the same file (it already mocks `$transaction`, `user.create`, `workspace.create`, `workspaceMember.create`). Assert `result.accessToken` is set and `prisma.workspace.create` was called once.

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && npx jest src/modules/auth/auth.service.spec.ts -t provisionInvitedUser`
Expected: FAIL — method undefined.

- [ ] **Step 3: Implement**

In `apps/api/src/modules/auth/auth.service.ts`, add a public method that reuses the same body as `register` minus the verification email, and **without** linking to the invite workspace (the invites service does that). Extract the shared creation into this method:

```typescript
  /**
   * Create a brand-new user + their personal workspace (no email verification send).
   * Used by the invite-accept-signup flow; the caller links the family membership.
   * Returns the created user view and a fresh token pair.
   */
  async provisionInvitedUser(input: {
    email: string;
    displayName: string;
    password: string;
    baseCurrency: string;
    timezone: string;
  }): Promise<AuthResult> {
    const passwordHash = await bcrypt.hash(input.password, this.rounds());
    const firstName = input.displayName.split(/\s+/)[0] ?? input.displayName;
    const workspaceName = `${firstName}'s Finances`;
    const slug = `${slugify(`${firstName} finances`)}-${randomBytes(2).toString('hex')}`;
    const accountNumber = await uniqueAccountNumber(this.prisma);

    try {
      const { user, workspace } = await this.prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            email: input.email,
            passwordHash,
            displayName: input.displayName,
            timezone: input.timezone,
            accountNumber,
            preferences: DEFAULT_PREFERENCES as unknown as Prisma.InputJsonValue,
          },
          select: {
            id: true, displayName: true, email: true, emailVerified: true,
            timezone: true, accountNumber: true, preferences: true,
          },
        });
        const createdWorkspace = await tx.workspace.create({
          data: { name: workspaceName, slug, baseCurrency: input.baseCurrency, preferredCurrencies: [input.baseCurrency] },
          select: { id: true, name: true, slug: true, tier: true, baseCurrency: true, preferredCurrencies: true },
        });
        await tx.workspaceMember.create({
          data: { workspaceId: createdWorkspace.id, userId: createdUser.id, role: 'OWNER', acceptedAt: new Date() },
        });
        await tx.category.createMany({
          data: DEFAULT_CATEGORIES.map((category) => ({
            workspaceId: createdWorkspace.id, name: category.name, color: category.color, icon: category.icon, isDefault: true,
          })),
        });
        return { user: createdUser, workspace: createdWorkspace };
      });

      const tokens = await this.issueTokenPair(user.id, user.email);
      return { user: this.toUserView(user), workspace: this.toWorkspaceView(workspace), ...tokens };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('An account with that email already exists.');
      }
      throw error;
    }
  }
```

> **DRY note:** `register` and `provisionInvitedUser` now share the same transaction body. The implementer MAY extract a private `createUserWithWorkspace(...)` helper and have both call it. Optional for M1; do it only if it stays clear.

- [ ] **Step 4: Ensure `AuthModule` exports `AuthService`**

Open `apps/api/src/modules/auth/auth.module.ts`. Confirm `exports: [AuthService]` is present; if not, add it.

- [ ] **Step 5: Run to verify pass + build**

Run: `cd apps/api && npx jest src/modules/auth/auth.service.spec.ts -t provisionInvitedUser`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/auth
git commit -m "feat(auth): provisionInvitedUser for invite signup flow"
```

---

### Task 9: `InvitesService` — preview, accept (existing), accept-signup (new)

**Files:**
- Create: `apps/api/src/modules/members/invites.service.ts`
- Test: `apps/api/src/modules/members/invites.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { ConflictException, ForbiddenException, GoneException, NotFoundException } from '@nestjs/common';
import { InvitesService } from './invites.service';

function activeInvite(over: Record<string, unknown> = {}) {
  return {
    id: 'inv1', workspaceId: 'ws1', email: 'a@x.com', role: 'VIEWER',
    status: 'PENDING', expiresAt: new Date(Date.now() + 60_000), acceptedAt: null,
    invitedByUserId: 'u1',
    workspace: { name: 'The Johnson Family' },
    ...over,
  };
}

function buildPrisma(over: Record<string, unknown> = {}) {
  return {
    workspaceInvite: {
      findUnique: jest.fn().mockResolvedValue(activeInvite()),
      update: jest.fn().mockResolvedValue({}),
    },
    workspaceMember: {
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'm9' }),
    },
    workspace: { findUnique: jest.fn().mockResolvedValue({ maxMembers: 5 }) },
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'u2', email: 'a@x.com', displayName: 'Ada' }) },
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(over.tx ?? {})),
    ...over,
  };
}

function build(prisma = buildPrisma(), auth = { provisionInvitedUser: jest.fn() }) {
  return { service: new InvitesService(prisma as never, auth as never), prisma, auth };
}

describe('InvitesService.preview', () => {
  it('returns valid state for an active invite', async () => {
    const { service } = build();
    const p = await service.preview('rawtoken');
    expect(p).toEqual(expect.objectContaining({ workspaceName: 'The Johnson Family', email: 'a@x.com', role: 'VIEWER', state: 'valid' }));
  });

  it('404s for an unknown token', async () => {
    const prisma = buildPrisma({ workspaceInvite: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() } });
    const { service } = build(prisma);
    await expect(service.preview('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reports expired state for a past-due pending invite', async () => {
    const prisma = buildPrisma({ workspaceInvite: { findUnique: jest.fn().mockResolvedValue(activeInvite({ expiresAt: new Date(Date.now() - 1000) })), update: jest.fn() } });
    const { service } = build(prisma);
    const p = await service.preview('rawtoken');
    expect(p.state).toBe('expired');
  });
});

describe('InvitesService.accept (existing user)', () => {
  it('rejects when the user email does not match the invite', async () => {
    const prisma = buildPrisma({ user: { findUnique: jest.fn().mockResolvedValue({ id: 'u2', email: 'other@x.com', displayName: 'X' }) } });
    const { service } = build(prisma);
    await expect(service.accept('rawtoken', 'u2')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates membership + marks invite accepted on the happy path', async () => {
    const { service, prisma } = build();
    await service.accept('rawtoken', 'u2');
    expect(prisma.workspaceMember.create).toHaveBeenCalled();
  });

  it('409s when seats are full at accept time', async () => {
    const prisma = buildPrisma({ workspaceMember: { count: jest.fn().mockResolvedValue(5), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() } });
    const { service } = build(prisma);
    await expect(service.accept('rawtoken', 'u2')).rejects.toBeInstanceOf(ConflictException);
  });

  it('410s for an expired invite', async () => {
    const prisma = buildPrisma({ workspaceInvite: { findUnique: jest.fn().mockResolvedValue(activeInvite({ expiresAt: new Date(Date.now() - 1000) })), update: jest.fn() } });
    const { service } = build(prisma);
    await expect(service.accept('rawtoken', 'u2')).rejects.toBeInstanceOf(GoneException);
  });
});

describe('InvitesService.acceptSignup (new user)', () => {
  it('provisions the account then links family membership', async () => {
    const auth = { provisionInvitedUser: jest.fn().mockResolvedValue({ user: { id: 'u3' }, accessToken: 'a', refreshToken: 'r', workspace: {} }) };
    const prisma = buildPrisma({ user: { findUnique: jest.fn().mockResolvedValue(null) } });
    const { service } = build(prisma, auth);
    const res = await service.acceptSignup('rawtoken', { displayName: 'Ada', password: 'password123', baseCurrency: 'USD', timezone: 'UTC' });
    expect(auth.provisionInvitedUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'a@x.com', displayName: 'Ada' }));
    expect(prisma.workspaceMember.create).toHaveBeenCalled();
    expect(res.accessToken).toBe('a');
  });

  it('409s when an account with the invite email already exists', async () => {
    const prisma = buildPrisma({ user: { findUnique: jest.fn().mockResolvedValue({ id: 'u2', email: 'a@x.com' }) } });
    const { service } = build(prisma);
    await expect(service.acceptSignup('rawtoken', { displayName: 'Ada', password: 'password123', baseCurrency: 'USD', timezone: 'UTC' })).rejects.toBeInstanceOf(ConflictException);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && npx jest src/modules/members/invites.service.spec.ts`
Expected: FAIL — cannot find `invites.service`.

- [ ] **Step 3: Implement**

Create `apps/api/src/modules/members/invites.service.ts`:

```typescript
import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import type { AuthResult } from '../auth/auth.types';
import type { AcceptSignupInput } from './dto/members.schemas';

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

type InviteState = 'valid' | 'expired' | 'revoked' | 'accepted';

export interface InvitePreview {
  workspaceName: string;
  email: string;
  role: string;
  state: InviteState;
}

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  private async loadByToken(rawToken: string) {
    const invite = await this.prisma.workspaceInvite.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { workspace: { select: { name: true, maxMembers: true } } },
    });
    if (!invite) throw new NotFoundException('Invitation not found.');
    return invite;
  }

  private stateOf(invite: { status: string; expiresAt: Date }): InviteState {
    if (invite.status === 'REVOKED') return 'revoked';
    if (invite.status === 'ACCEPTED') return 'accepted';
    if (invite.expiresAt.getTime() < Date.now()) return 'expired';
    return 'valid';
  }

  async preview(rawToken: string): Promise<InvitePreview> {
    const invite = await this.loadByToken(rawToken);
    return {
      workspaceName: invite.workspace.name,
      email: invite.email,
      role: invite.role,
      state: this.stateOf(invite),
    };
  }

  /** Existing, authenticated user accepts. Their email must match the invite. */
  async accept(rawToken: string, currentUserId: string): Promise<{ workspaceId: string }> {
    const invite = await this.loadByToken(rawToken);
    if (this.stateOf(invite) === 'expired') throw new GoneException('This invitation has expired.');
    if (invite.status !== 'PENDING') throw new ConflictException('This invitation is no longer valid.');

    const user = await this.prisma.user.findUnique({
      where: { id: currentUserId },
      select: { id: true, email: true },
    });
    if (!user) throw new NotFoundException('User not found.');
    if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
      throw new ForbiddenException('This invitation was sent to a different email address.');
    }

    const existing = await this.prisma.workspaceMember.findFirst({
      where: { workspaceId: invite.workspaceId, userId: user.id },
      select: { id: true },
    });
    if (existing) {
      // Idempotent: already a member — just close the invite.
      await this.prisma.workspaceInvite.update({ where: { id: invite.id }, data: { status: 'ACCEPTED', acceptedAt: new Date() } });
      return { workspaceId: invite.workspaceId };
    }

    await this.assertSeatAvailable(invite.workspaceId, invite.workspace.maxMembers);

    await this.prisma.$transaction(async (tx) => {
      await tx.workspaceMember.create({
        data: { workspaceId: invite.workspaceId, userId: user.id, role: invite.role, acceptedAt: new Date() },
      });
      await tx.workspaceInvite.update({ where: { id: invite.id }, data: { status: 'ACCEPTED', acceptedAt: new Date() } });
    });
    return { workspaceId: invite.workspaceId };
  }

  /** New user signs up via the invite. Email is taken from the invite, not the body. */
  async acceptSignup(rawToken: string, input: AcceptSignupInput): Promise<AuthResult> {
    const invite = await this.loadByToken(rawToken);
    if (this.stateOf(invite) === 'expired') throw new GoneException('This invitation has expired.');
    if (invite.status !== 'PENDING') throw new ConflictException('This invitation is no longer valid.');

    const existing = await this.prisma.user.findUnique({ where: { email: invite.email }, select: { id: true } });
    if (existing) {
      throw new ConflictException('An account with this email already exists — log in and accept the invitation.');
    }
    await this.assertSeatAvailable(invite.workspaceId, invite.workspace.maxMembers);

    const auth = await this.auth.provisionInvitedUser({
      email: invite.email,
      displayName: input.displayName,
      password: input.password,
      baseCurrency: input.baseCurrency,
      timezone: input.timezone,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.workspaceMember.create({
        data: { workspaceId: invite.workspaceId, userId: auth.user.id, role: invite.role, acceptedAt: new Date() },
      });
      await tx.workspaceInvite.update({ where: { id: invite.id }, data: { status: 'ACCEPTED', acceptedAt: new Date() } });
    });
    return auth;
  }

  private async assertSeatAvailable(workspaceId: string, maxMembers: number): Promise<void> {
    const [memberCount, pendingCount] = await Promise.all([
      this.prisma.workspaceMember.count({ where: { workspaceId } }),
      this.prisma.workspaceInvite.count({ where: { workspaceId, status: 'PENDING' } }),
    ]);
    // Pending count includes the invite being accepted; allow if members < max.
    if (memberCount >= maxMembers) {
      throw new ConflictException('This family workspace is full.');
    }
    void pendingCount;
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/api && npx jest src/modules/members/invites.service.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/members/invites.service.ts apps/api/src/modules/members/invites.service.spec.ts
git commit -m "feat(members): invite preview + accept (existing & new user)"
```

---

## Phase D — Backend: controllers + module wiring

### Task 10: `MembersController` (workspace-scoped)

**Files:**
- Create: `apps/api/src/modules/members/members.controller.ts`

- [ ] **Step 1: Implement the controller**

```typescript
import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Workspace } from '../../common/decorators/workspace.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { WorkspaceMemberGuard } from '../../common/guards/workspace-member.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../auth/auth.types';
import type { WorkspaceContext } from '../../common/context';
import { MembersService, type InviteView, type MemberView } from './members.service';
import {
  changeRoleSchema, createInviteSchema, type ChangeRoleInput, type CreateInviteInput,
} from './dto/members.schemas';

@Controller('workspaces/:workspaceId')
@UseGuards(WorkspaceMemberGuard)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get('members')
  listMembers(@Workspace() ws: WorkspaceContext, @CurrentUser() user: AuthUser): Promise<MemberView[]> {
    return this.members.listMembers(ws.id, user.userId);
  }

  @Get('invites')
  @Roles('OWNER')
  @UseGuards(RolesGuard)
  listInvites(@Workspace() ws: WorkspaceContext): Promise<InviteView[]> {
    return this.members.listInvites(ws.id);
  }

  @Post('invites')
  @Roles('OWNER')
  @UseGuards(RolesGuard)
  invite(
    @Workspace() ws: WorkspaceContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createInviteSchema)) body: CreateInviteInput,
  ): Promise<InviteView> {
    return this.members.inviteMember(ws.id, { userId: user.userId, name: user.email }, body);
  }

  @Delete('invites/:inviteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('OWNER')
  @UseGuards(RolesGuard)
  cancelInvite(@Workspace() ws: WorkspaceContext, @Param('inviteId') inviteId: string): Promise<void> {
    return this.members.cancelInvite(ws.id, inviteId);
  }

  @Post('invites/:inviteId/resend')
  @Roles('OWNER')
  @UseGuards(RolesGuard)
  resendInvite(
    @Workspace() ws: WorkspaceContext,
    @CurrentUser() user: AuthUser,
    @Param('inviteId') inviteId: string,
  ): Promise<InviteView> {
    return this.members.resendInvite(ws.id, inviteId, user.email);
  }

  @Patch('members/:memberId')
  @Roles('OWNER')
  @UseGuards(RolesGuard)
  changeRole(
    @Workspace() ws: WorkspaceContext,
    @Param('memberId') memberId: string,
    @Body(new ZodValidationPipe(changeRoleSchema)) body: ChangeRoleInput,
  ): Promise<MemberView> {
    return this.members.changeRole(ws.id, memberId, body);
  }

  @Delete('members/me')
  @HttpCode(HttpStatus.NO_CONTENT)
  leave(@Workspace() ws: WorkspaceContext, @CurrentUser() user: AuthUser): Promise<void> {
    return this.members.leave(ws.id, user.userId);
  }

  @Delete('members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('OWNER')
  @UseGuards(RolesGuard)
  removeMember(@Workspace() ws: WorkspaceContext, @Param('memberId') memberId: string): Promise<void> {
    return this.members.removeMember(ws.id, memberId);
  }
}
```

> **Route-ordering note:** `members/me` is declared **before** `members/:memberId` so the literal route wins over the param route. Keep that order.
> **Display-name note:** the controller passes `user.email` as the inviter name because `AuthUser` only carries `userId` + `email`. That's acceptable for M1 (the email appears in the invite email's "X invited you"). If you want the real display name, fetch it in the service from `prisma.user`. Leave as-is for M1.

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json 2>&1 | grep members.controller || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/members/members.controller.ts
git commit -m "feat(members): workspace-scoped members controller"
```

---

### Task 11: `InvitesController` (public token routes)

**Files:**
- Create: `apps/api/src/modules/members/invites.controller.ts`

- [ ] **Step 1: Implement the controller**

```typescript
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../auth/auth.types';
import type { AuthResult } from '../auth/auth.types';
import { InvitesService, type InvitePreview } from './invites.service';
import { acceptSignupSchema, type AcceptSignupInput } from './dto/members.schemas';

@Controller('invites')
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Public()
  @Get(':token')
  preview(@Param('token') token: string): Promise<InvitePreview> {
    return this.invites.preview(token);
  }

  // Authenticated existing-user accept. JwtAuthGuard is global, but this controller
  // is not marked @Public, so the token is required here.
  @Post(':token/accept')
  @HttpCode(HttpStatus.OK)
  accept(@Param('token') token: string, @CurrentUser() user: AuthUser): Promise<{ workspaceId: string }> {
    return this.invites.accept(token, user.userId);
  }

  @Public()
  @Post(':token/accept-signup')
  @HttpCode(HttpStatus.OK)
  acceptSignup(
    @Param('token') token: string,
    @Body(new ZodValidationPipe(acceptSignupSchema)) body: AcceptSignupInput,
  ): Promise<AuthResult> {
    return this.invites.acceptSignup(token, body);
  }
}
```

> **Guard note:** `JwtAuthGuard` is registered globally as an `APP_GUARD` (see `app.module.ts`) and honors `@Public()`. The `preview` and `accept-signup` routes are `@Public()`; `accept` is not, so it requires a valid access token. The unused `JwtAuthGuard` import can be removed — it's listed only to make the dependency explicit; delete it if the linter complains.

- [ ] **Step 2: Verify it compiles (after removing the unused import if needed)**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json 2>&1 | grep invites.controller || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/members/invites.controller.ts
git commit -m "feat(members): public invite preview/accept controller"
```

---

### Task 12: `MembersModule` + register in `AppModule`

**Files:**
- Create: `apps/api/src/modules/members/members.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create the module**

```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { MembersService } from './members.service';
import { InvitesService } from './invites.service';
import { MembersController } from './members.controller';
import { InvitesController } from './invites.controller';

@Module({
  imports: [AuthModule, EmailModule],
  controllers: [MembersController, InvitesController],
  providers: [MembersService, InvitesService],
})
export class MembersModule {}
```

- [ ] **Step 2: Register in `AppModule`**

In `apps/api/src/app.module.ts`, add the import near the other module imports:

```typescript
import { MembersModule } from './modules/members/members.module';
```

and add `MembersModule` to the `imports: [...]` array (e.g. after `SettingsModule`).

- [ ] **Step 3: Build the API to verify DI wiring**

Run: `cd apps/api && npm run build`
Expected: build succeeds (no Nest DI resolution errors for `MembersService`/`InvitesService`/`AuthService`/`EmailService`).

- [ ] **Step 4: Run the full API test suite**

Run: `cd apps/api && npx jest`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/members/members.module.ts apps/api/src/app.module.ts
git commit -m "feat(members): wire MembersModule into the app"
```

---

### Task 13: `GET /auth/workspaces` (switcher data source)

**Files:**
- Modify: `apps/api/src/modules/auth/auth.service.ts`
- Modify: `apps/api/src/modules/auth/auth.controller.ts`
- Modify: `apps/api/src/modules/auth/auth.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Add to `auth.service.spec.ts`:

```typescript
describe('AuthService.listWorkspaces', () => {
  it('returns all memberships mapped to summaries', async () => {
    // Arrange prisma.workspaceMember.findMany to return two memberships with included workspace.
    // Assert the result maps { workspaceId, name, slug, tier, role, baseCurrency }.
  });
});
```

> **Implementer note:** in the file's prisma mock, add `workspaceMember: { findMany: jest.fn().mockResolvedValue([...]) }` returning rows shaped like `{ role, workspace: { id, name, slug, tier, baseCurrency } }`, then assert the mapped output.

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && npx jest src/modules/auth/auth.service.spec.ts -t listWorkspaces`
Expected: FAIL.

- [ ] **Step 3: Implement the service method + view type**

Add the interface to `apps/api/src/modules/auth/auth.types.ts`:

```typescript
export interface WorkspaceMembershipView {
  workspaceId: string;
  name: string;
  slug: string;
  tier: SubscriptionTier;
  role: 'OWNER' | 'CO_MANAGER' | 'VIEWER';
  baseCurrency: string;
}
```

Add to `AuthService`:

```typescript
  async listWorkspaces(userId: string): Promise<WorkspaceMembershipView[]> {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId },
      orderBy: { joinedAt: 'asc' },
      select: {
        role: true,
        workspace: { select: { id: true, name: true, slug: true, tier: true, baseCurrency: true } },
      },
    });
    return memberships.map((m) => ({
      workspaceId: m.workspace.id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      tier: m.workspace.tier,
      role: m.role,
      baseCurrency: m.workspace.baseCurrency,
    }));
  }
```

Import `WorkspaceMembershipView` in `auth.service.ts` from `./auth.types`.

- [ ] **Step 4: Add the controller route**

In `apps/api/src/modules/auth/auth.controller.ts`, add (this controller is already behind the global `JwtAuthGuard`; use `@CurrentUser`):

```typescript
  @Get('workspaces')
  listWorkspaces(@CurrentUser() user: AuthUser): Promise<WorkspaceMembershipView[]> {
    return this.auth.listWorkspaces(user.userId);
  }
```

Add the needed imports: `Get` (from `@nestjs/common` — already imported), `CurrentUser` from `../../common/decorators/current-user.decorator`, and `WorkspaceMembershipView` from `./auth.types`.

- [ ] **Step 5: Run test + build**

Run: `cd apps/api && npx jest src/modules/auth/auth.service.spec.ts -t listWorkspaces && npm run build`
Expected: PASS + build OK.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/auth
git commit -m "feat(auth): GET /auth/workspaces for workspace switcher"
```

---

## Phase E — Frontend

### Task 14: Web types + `members-api.ts` client

**Files:**
- Modify: `apps/web/src/lib/types.ts`
- Create: `apps/web/src/lib/members-api.ts`

- [ ] **Step 1: Add types**

In `apps/web/src/lib/types.ts`, add:

```typescript
export type WorkspaceMemberRole = 'OWNER' | 'CO_MANAGER' | 'VIEWER';

export interface WorkspaceMembershipSummary {
  workspaceId: string;
  name: string;
  slug: string;
  tier: SubscriptionTier;
  role: WorkspaceMemberRole;
  baseCurrency: string;
}

export interface MemberView {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  role: WorkspaceMemberRole;
  joinedAt: string;
  isSelf: boolean;
}

export interface InviteView {
  id: string;
  email: string;
  role: WorkspaceMemberRole;
  invitedByUserId: string;
  expiresAt: string;
  createdAt: string;
}

export interface InvitePreview {
  workspaceName: string;
  email: string;
  role: WorkspaceMemberRole;
  state: 'valid' | 'expired' | 'revoked' | 'accepted';
}
```

- [ ] **Step 2: Create the API client**

Create `apps/web/src/lib/members-api.ts` (mirrors `billing-api.ts`):

```typescript
import { apiFetch } from './api-client';
import { useAuth } from './store';
import type {
  AuthResult, InvitePreview, InviteView, MemberView, WorkspaceMembershipSummary, WorkspaceMemberRole,
} from './types';

function authed<T>(path: string, init?: RequestInit): Promise<T> {
  return useAuth.getState().authed<T>(path, init);
}

export function listWorkspaces(): Promise<WorkspaceMembershipSummary[]> {
  return authed<WorkspaceMembershipSummary[]>('/auth/workspaces');
}

export function listMembers(workspaceId: string): Promise<MemberView[]> {
  return authed<MemberView[]>(`/workspaces/${workspaceId}/members`);
}

export function listInvites(workspaceId: string): Promise<InviteView[]> {
  return authed<InviteView[]>(`/workspaces/${workspaceId}/invites`);
}

export function inviteMember(workspaceId: string, email: string, role: Exclude<WorkspaceMemberRole, 'OWNER'>): Promise<InviteView> {
  return authed<InviteView>(`/workspaces/${workspaceId}/invites`, {
    method: 'POST',
    body: JSON.stringify({ email, role }),
  });
}

export function cancelInvite(workspaceId: string, inviteId: string): Promise<void> {
  return authed<void>(`/workspaces/${workspaceId}/invites/${inviteId}`, { method: 'DELETE' });
}

export function resendInvite(workspaceId: string, inviteId: string): Promise<InviteView> {
  return authed<InviteView>(`/workspaces/${workspaceId}/invites/${inviteId}/resend`, { method: 'POST' });
}

export function changeMemberRole(workspaceId: string, memberId: string, role: WorkspaceMemberRole): Promise<MemberView> {
  return authed<MemberView>(`/workspaces/${workspaceId}/members/${memberId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export function removeMember(workspaceId: string, memberId: string): Promise<void> {
  return authed<void>(`/workspaces/${workspaceId}/members/${memberId}`, { method: 'DELETE' });
}

export function leaveWorkspace(workspaceId: string): Promise<void> {
  return authed<void>(`/workspaces/${workspaceId}/members/me`, { method: 'DELETE' });
}

// Public (no auth) invite endpoints:
export function previewInvite(token: string): Promise<InvitePreview> {
  return apiFetch<InvitePreview>(`/invites/${token}`);
}

export function acceptInvite(token: string): Promise<{ workspaceId: string }> {
  return authed<{ workspaceId: string }>(`/invites/${token}/accept`, { method: 'POST' });
}

export function acceptInviteSignup(
  token: string,
  body: { displayName: string; password: string; baseCurrency?: string; timezone?: string },
): Promise<AuthResult> {
  return apiFetch<AuthResult>(`/invites/${token}/accept-signup`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep members-api || echo "clean"`
Expected: `clean`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/types.ts apps/web/src/lib/members-api.ts
git commit -m "feat(web): members/invites API client and types"
```

---

### Task 15: Store — workspaces list + active workspace switcher

**Files:**
- Modify: `apps/web/src/lib/store.ts`
- Modify: `apps/web/src/lib/store.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/lib/store.test.ts` (follow existing test setup in that file):

```typescript
import { useAuth } from './store';

describe('workspace switcher', () => {
  it('setActiveWorkspace swaps the active workspace to a known membership', () => {
    useAuth.setState({
      workspace: { id: 'ws1', name: 'Mine', slug: 's1', tier: 'FREE', baseCurrency: 'USD', preferredCurrencies: ['USD'] } as never,
      workspaces: [
        { workspaceId: 'ws1', name: 'Mine', slug: 's1', tier: 'FREE', role: 'OWNER', baseCurrency: 'USD' },
        { workspaceId: 'ws2', name: 'Fam', slug: 's2', tier: 'FAMILY', role: 'VIEWER', baseCurrency: 'USD' },
      ],
      activeWorkspaceId: 'ws1',
    } as never);

    useAuth.getState().setActiveWorkspace('ws2');

    expect(useAuth.getState().activeWorkspaceId).toBe('ws2');
    expect(useAuth.getState().workspace?.id).toBe('ws2');
    expect(useAuth.getState().workspace?.tier).toBe('FAMILY');
  });

  it('setActiveWorkspace ignores an unknown id', () => {
    useAuth.setState({ workspaces: [], activeWorkspaceId: 'ws1' } as never);
    useAuth.getState().setActiveWorkspace('nope');
    expect(useAuth.getState().activeWorkspaceId).toBe('ws1');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && npm test -- store.test`
Expected: FAIL — `setActiveWorkspace` undefined / `workspaces` missing.

- [ ] **Step 3: Implement store changes**

In `apps/web/src/lib/store.ts`:

1. Import the summary type:
```typescript
import type {
  ApiUser, ApiWorkspace, AuthResult, RegisterInput, TokenPair, WorkspaceMembershipSummary,
} from './types';
```

2. Extend `AuthState` with:
```typescript
  workspaces: WorkspaceMembershipSummary[];
  activeWorkspaceId: string | null;
  fetchWorkspaces: () => Promise<void>;
  setActiveWorkspace: (id: string) => void;
```

3. Extend `CLEARED`:
```typescript
const CLEARED = {
  accessToken: null,
  refreshToken: null,
  user: null,
  workspace: null,
  workspaces: [] as WorkspaceMembershipSummary[],
  activeWorkspaceId: null as string | null,
  status: 'idle' as const,
};
```

4. In `login` and `register` success `set({...})` calls, also set `activeWorkspaceId: result.workspace.id`.

5. Add the actions inside the store body:
```typescript
      fetchWorkspaces: async () => {
        try {
          const list = await get().authed<WorkspaceMembershipSummary[]>('/auth/workspaces');
          set({ workspaces: list });
        } catch {
          /* ignore — keep current list */
        }
      },

      setActiveWorkspace: (id) => {
        const target = get().workspaces.find((w) => w.workspaceId === id);
        if (!target) return;
        const current = get().workspace;
        set({
          activeWorkspaceId: id,
          workspace: {
            ...(current ?? ({} as ApiWorkspace)),
            id: target.workspaceId,
            name: target.name,
            slug: target.slug,
            tier: target.tier,
            baseCurrency: target.baseCurrency,
            preferredCurrencies: current?.id === id ? (current?.preferredCurrencies ?? []) : [],
          } as ApiWorkspace,
        });
        const u = get().user;
        if (u) identifyUser(u.id, target.tier);
      },
```

6. In `partialize`, add `workspaces: s.workspaces` and `activeWorkspaceId: s.activeWorkspaceId`.

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/web && npm test -- store.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/store.ts apps/web/src/lib/store.test.ts
git commit -m "feat(web): workspace list + active workspace switching in store"
```

---

### Task 16: `WorkspaceSwitcher` component

**Files:**
- Create: `apps/web/src/components/workspace/workspace-switcher.tsx`
- Modify: the app header/nav that renders on `(app)` pages (locate via `apps/web/src/app/(app)/layout.tsx` or the nav component it renders)

- [ ] **Step 1: Implement the component**

```tsx
'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/store';

/** Dropdown to switch the active workspace. Hidden when the user has only one. */
export function WorkspaceSwitcher() {
  const workspaces = useAuth((s) => s.workspaces);
  const activeId = useAuth((s) => s.activeWorkspaceId);
  const setActive = useAuth((s) => s.setActiveWorkspace);
  const fetchWorkspaces = useAuth((s) => s.fetchWorkspaces);

  useEffect(() => {
    void fetchWorkspaces();
  }, [fetchWorkspaces]);

  if (workspaces.length < 2) return null;

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">Active workspace</span>
      <select
        value={activeId ?? ''}
        onChange={(e) => setActive(e.target.value)}
        className="rounded-lg border border-line bg-surface/60 px-2.5 py-1.5 text-sm text-ink"
      >
        {workspaces.map((w) => (
          <option key={w.workspaceId} value={w.workspaceId}>
            {w.name}
          </option>
        ))}
      </select>
    </label>
  );
}
```

- [ ] **Step 2: Render it in the app nav**

Open `apps/web/src/app/(app)/layout.tsx`. Identify the top bar / header element. Import and render `<WorkspaceSwitcher />` there:

```tsx
import { WorkspaceSwitcher } from '@/components/workspace/workspace-switcher';
// ...inside the header JSX:
<WorkspaceSwitcher />
```

If there is no header element in the layout, render it at the top of `apps/web/src/app/(app)/settings/page.tsx` instead (just under the `<h1>Settings</h1>`), so it is at least reachable. Prefer the global nav if one exists.

- [ ] **Step 3: Type-check + manual smoke**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep workspace-switcher || echo "clean"`
Expected: `clean`.
Manual: with a user who belongs to 2 workspaces, the dropdown appears and switching changes the active workspace (verified end-to-end in Task 19).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/workspace/workspace-switcher.tsx "apps/web/src/app/(app)/layout.tsx"
git commit -m "feat(web): workspace switcher in app nav"
```

---

### Task 17: `MembersSection` in Settings

**Files:**
- Create: `apps/web/src/components/settings/members-section.tsx`
- Modify: `apps/web/src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Implement the section**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/store';
import {
  changeMemberRole, cancelInvite, inviteMember, leaveWorkspace,
  listInvites, listMembers, removeMember, resendInvite,
} from '@/lib/members-api';
import type { InviteView, MemberView, WorkspaceMemberRole } from '@/lib/types';

export function MembersSection() {
  const workspace = useAuth((s) => s.workspace);
  const workspaces = useAuth((s) => s.workspaces);
  const activeId = useAuth((s) => s.activeWorkspaceId);
  const myRole = workspaces.find((w) => w.workspaceId === activeId)?.role ?? 'VIEWER';
  const isOwner = myRole === 'OWNER';

  const [members, setMembers] = useState<MemberView[]>([]);
  const [invites, setInvites] = useState<InviteView[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Exclude<WorkspaceMemberRole, 'OWNER'>>('VIEWER');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const wsId = workspace?.id;

  async function refresh() {
    if (!wsId) return;
    setMembers(await listMembers(wsId));
    if (isOwner) {
      try { setInvites(await listInvites(wsId)); } catch { /* non-owner */ }
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId]);

  // Only render for Family workspaces.
  if (!workspace || workspace.tier !== 'FAMILY') return null;

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!wsId) return;
    setBusy(true); setError(null);
    try {
      await inviteMember(wsId, email.trim(), role);
      setEmail('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send invite.');
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Action failed.'); }
    finally { setBusy(false); }
  }

  return (
    <section className="space-y-3">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
        Family members
      </h2>
      <div className="rounded-2xl border border-line bg-surface/60 p-5 shadow-card space-y-4">
        {error && <p className="text-sm text-red-400">{error}</p>}

        <ul className="divide-y divide-line">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-sm font-medium text-ink">
                  {m.displayName}{m.isSelf ? ' (you)' : ''}
                </p>
                <p className="text-xs text-muted">{m.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {isOwner && m.role !== 'OWNER' ? (
                  <select
                    value={m.role}
                    disabled={busy}
                    onChange={(e) => act(() => changeMemberRole(wsId!, m.id, e.target.value as WorkspaceMemberRole))}
                    className="rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink"
                  >
                    <option value="CO_MANAGER">Co-manager</option>
                    <option value="VIEWER">Viewer</option>
                  </select>
                ) : (
                  <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-medium text-accent">
                    {m.role === 'OWNER' ? 'Owner' : m.role === 'CO_MANAGER' ? 'Co-manager' : 'Viewer'}
                  </span>
                )}
                {isOwner && m.role !== 'OWNER' && (
                  <button
                    type="button" disabled={busy}
                    onClick={() => act(() => removeMember(wsId!, m.id))}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>

        {isOwner && (
          <form onSubmit={onInvite} className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <input
              type="email" required value={email} disabled={busy}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@email.com"
              className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
            />
            <select
              value={role} disabled={busy}
              onChange={(e) => setRole(e.target.value as Exclude<WorkspaceMemberRole, 'OWNER'>)}
              className="rounded-lg border border-line bg-surface px-2 py-2 text-sm text-ink"
            >
              <option value="VIEWER">Viewer</option>
              <option value="CO_MANAGER">Co-manager</option>
            </select>
            <button
              type="submit" disabled={busy || !email.trim()}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Invite
            </button>
          </form>
        )}

        {isOwner && invites.length > 0 && (
          <div className="border-t border-line pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Pending invites</p>
            <ul className="divide-y divide-line">
              {invites.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between py-2">
                  <span className="text-sm text-ink">{inv.email}</span>
                  <div className="flex items-center gap-3">
                    <button type="button" disabled={busy} onClick={() => act(() => resendInvite(wsId!, inv.id))} className="text-xs text-accent hover:text-accent-hover">Resend</button>
                    <button type="button" disabled={busy} onClick={() => act(() => cancelInvite(wsId!, inv.id))} className="text-xs text-red-400 hover:text-red-300">Cancel</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!isOwner && (
          <button
            type="button" disabled={busy}
            onClick={() => act(() => leaveWorkspace(wsId!))}
            className="text-sm text-red-400 hover:text-red-300"
          >
            Leave this family
          </button>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Wire into the Settings page**

In `apps/web/src/app/(app)/settings/page.tsx`, import and render `<MembersSection />` (place it just above `<ReferSection />`):

```tsx
import { MembersSection } from '@/components/settings/members-section';
// ...in JSX, before <ReferSection />:
<MembersSection />
```

- [ ] **Step 3: Type-check**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep members-section || echo "clean"`
Expected: `clean`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/settings/members-section.tsx "apps/web/src/app/(app)/settings/page.tsx"
git commit -m "feat(web): family members management section in settings"
```

---

### Task 18: `/invite/[token]` accept page

**Files:**
- Create: `apps/web/src/app/invite/[token]/page.tsx`

- [ ] **Step 1: Implement the page**

```tsx
'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/store';
import { acceptInvite, acceptInviteSignup, previewInvite } from '@/lib/members-api';
import type { InvitePreview } from '@/lib/types';

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const status = useAuth((s) => s.status);
  const setState = useAuth.setState;

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    previewInvite(token).then(setPreview).catch((e) => setLoadError(e instanceof Error ? e.message : 'Invalid invitation.'));
  }, [token]);

  async function onAcceptExisting() {
    setBusy(true); setActionError(null);
    try {
      await acceptInvite(token);
      await useAuth.getState().fetchWorkspaces();
      router.push('/settings');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not accept the invitation.');
    } finally { setBusy(false); }
  }

  async function onAcceptSignup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setActionError(null);
    try {
      const result = await acceptInviteSignup(token, { displayName: displayName.trim(), password });
      setState({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
        workspace: result.workspace,
        activeWorkspaceId: result.workspace.id,
        status: 'authed',
      } as never);
      await useAuth.getState().fetchWorkspaces();
      router.push('/dashboard');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not create your account.');
    } finally { setBusy(false); }
  }

  const shell = (children: React.ReactNode) => (
    <div className="min-h-dvh overflow-y-auto bg-canvas px-4 py-10">
      <div className="mx-auto w-full max-w-md space-y-6">{children}</div>
    </div>
  );

  if (loadError) return shell(<p className="text-center text-sm text-red-400">{loadError}</p>);
  if (!preview) return shell(<p className="text-center text-sm text-muted">Loading invitation…</p>);

  if (preview.state !== 'valid') {
    const msg =
      preview.state === 'expired' ? 'This invitation has expired.'
      : preview.state === 'revoked' ? 'This invitation was cancelled.'
      : 'This invitation has already been accepted.';
    return shell(<p className="text-center text-sm text-muted">{msg}</p>);
  }

  return shell(
    <>
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Join {preview.workspaceName}</h1>
        <p className="mt-1 text-sm text-muted">
          You were invited as a {preview.role === 'CO_MANAGER' ? 'co-manager' : 'viewer'} ({preview.email}).
        </p>
      </div>

      {actionError && <p className="text-sm text-red-400">{actionError}</p>}

      {status === 'authed' ? (
        <button
          type="button" disabled={busy} onClick={onAcceptExisting}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Accept invitation
        </button>
      ) : (
        <form onSubmit={onAcceptSignup} className="space-y-3">
          <input value={preview.email} disabled className="w-full rounded-lg border border-line bg-surface/40 px-3 py-2.5 text-sm text-muted" />
          <input
            type="text" required placeholder="Your name" value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink"
          />
          <input
            type="password" required minLength={8} placeholder="Create a password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink"
          />
          <button type="submit" disabled={busy} className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
            Create account &amp; join
          </button>
          <p className="text-center text-xs text-muted">
            Already have an account?{' '}
            <a href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} className="text-accent hover:text-accent-hover">Log in</a> to accept.
          </p>
        </form>
      )}
    </>,
  );
}
```

> **Implementer notes:**
> - Confirm the dashboard route is `/dashboard` (check `apps/web/src/app/(app)/`); adjust the `router.push` target if the post-login landing page differs.
> - The "Log in" link uses `?next=`. Verify the login page honors a `next` param; if it does not, this is a minor follow-up (the user can log in then re-open the invite link). Do not block M1 on it — note it.
> - `use(params)` is the Next.js 15 pattern for async route params in client components. If the project's React version errors on `use`, fall back to `useParams()` from `next/navigation`.

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep "invite/\[token\]" || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/invite/[token]/page.tsx"
git commit -m "feat(web): public invite accept page"
```

---

## Phase F — Full verification

### Task 19: End-to-end verification + gates

**Files:** none (verification only)

- [ ] **Step 1: Backend — full test suite**

Run: `cd apps/api && npx jest`
Expected: all suites pass (members, invites, auth, email, settings, and pre-existing).

- [ ] **Step 2: Repo build**

Run: `npm run build`
Expected: turbo builds `@finby/shared`, `api`, and `web` with no type errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors. Fix any lint issues introduced (unused imports in `invites.controller.ts`, etc.).

- [ ] **Step 4: Web tests**

Run: `cd apps/web && npm test`
Expected: store switcher tests and existing tests pass.

- [ ] **Step 5: Manual smoke (local stack)**

Bring up the stack (`docker compose up -d` for PG :5434 / Redis :6380, then run api + web dev servers) and verify:
1. Owner on Family: Settings → Family members section visible; send invite to a new email.
2. Invite email link → `/invite/<token>` → preview shows workspace + role.
3. New-user signup-and-join → lands authenticated; switcher shows two workspaces.
4. Switch to the family workspace → tier reads FAMILY.
5. As owner: change the member's role, then remove them → list updates; seat frees.
6. Invite an existing user → that user logs in → `/invite/<token>` → Accept → appears in members; their switcher shows the family.
7. As a non-owner member: "Leave this family" → removed.
8. Edge: invite when not on Family (downgrade a test workspace) → 403; invite a 5th seat when full → 409.

Document any deviations as follow-up issues.

- [ ] **Step 6: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "chore(family): verification fixes for milestone 1"
```

---

## Out of scope (Milestone 2 — do NOT build here)

- Role-enforcement sweep on existing finance write endpoints (transactions, budgets, accounts, categories, portfolio, alerts, settings) so VIEWER becomes truly read-only and CO_MANAGER cannot touch billing/members. Tracked separately.
- Member deactivate/suspend (decided against).
- Cross-workspace financial rollups.
- Notifications beyond the invite email.
