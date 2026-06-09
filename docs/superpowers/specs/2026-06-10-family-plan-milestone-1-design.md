# Family Plan — Milestone 1 Design

**Date:** 2026-06-10
**Status:** Approved (design)
**Author:** brainstorming session
**Scope:** Make the Family plan usable end-to-end — invite, accept, list members, change role, remove, leave — with a workspace switcher. Hardening of role enforcement across existing finance endpoints is deferred to Milestone 2.

---

## 1. Background

Today the Family plan can be *purchased* but not *used*:

- `Workspace` + `WorkspaceMember` (roles `OWNER | CO_MANAGER | VIEWER`) and a `FAMILY` tier (`maxMembers: 5`, `memberInvites: true`) already exist (`apps/api/prisma/schema.prisma`, `packages/shared/src/constants.ts`).
- Seat limits are enforced on tier change (`apps/api/src/modules/billing/subscription.service.ts:142,150-154`).
- Auth guards (`WorkspaceMemberGuard`, `RolesGuard`, `@Roles`, `@Workspace()`) are in place and used by billing/settings.
- **Missing:** any endpoint or UI to invite, accept, list, or manage members. No invite email. The only family-adjacent UI is a "Coming soon" `ReferSection`.

A key architectural fact: every user gets their **own** workspace at signup (`auth.service.ts`), and `login` loads only the first membership (`auth.service.ts:131`, `take: 1`). The web store holds a single `workspace` (`apps/web/src/lib/store.ts:32`) — there is no workspace switcher today.

## 2. Product decisions (settled during brainstorming)

1. **Family = one shared workspace.** All members see the same finances (transactions, budgets, accounts, net worth). Invitees **join the owner's workspace** and also **keep their personal workspace**; a **workspace switcher** lets them toggle between "My finances" and the family.
2. **Invites are email-based and work for new *and* existing users.** Owner enters an email → tokenized email link (`/invite/[token]`). Recipients without an account sign up on the accept page; existing users log in and accept. Tokens expire (default 7 days).
3. **Three roles:** OWNER (everything incl. billing + member management + edit finances), CO_MANAGER (edit finances, no billing, no member management), VIEWER (read-only).
4. **Remove + Leave (no deactivate).** OWNER removes a member (deletes membership → instant access loss; personal workspace untouched). Non-owner members can leave voluntarily. No suspend/status field.
5. **Subscriptions belong to the workspace, not the user.** A member is never billed; they have *access* to a workspace on the Family plan. Removing a member reverts nothing on their side — their personal workspace stays whatever tier it was (FREE by default). A seat frees up. The OWNER cannot be removed (they hold the subscription); the existing seat guard already forces the owner to remove members before downgrading off Family.

## 3. Milestone split

**Milestone 1 (this spec):** invite / accept (new + existing) / list members / change role / remove / leave; pending-invite cancel + resend; workspace switcher; seat-limit + tier gating; OWNER-gating on management actions.

**Milestone 2 (tracked follow-up, NOT in this spec):** sweep `@Roles('OWNER','CO_MANAGER')` onto every existing financial **write** endpoint (transactions, budgets, accounts, categories, portfolio, alerts, settings) so VIEWER becomes genuinely read-only and CO_MANAGER cannot touch billing/members. In M1, roles are assigned and enforced on the new member/billing endpoints only; a VIEWER is **not yet** blocked from editing finances. This is the explicit known gap.

## 4. Data model

### Decision: dedicated `WorkspaceInvite` model

The schema placed invite fields (`inviteToken`, `inviteEmail`, `inviteExpiry`) on `WorkspaceMember`, but `WorkspaceMember.userId` is **non-nullable** (`schema.prisma:228`) — so a pending invite to someone without an account cannot be stored there. Rather than make `userId` nullable (which ripples into `WorkspaceMemberGuard` and every membership query), introduce a dedicated model. `WorkspaceMember` keeps its invariant: "an accepted member who always has a user."

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
  tokenHash       String              @unique  // SHA-256 of raw token; raw is emailed only
  status          InviteStatus        @default(PENDING)
  invitedByUserId String
  expiresAt       DateTime
  acceptedAt      DateTime?
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  @@unique([workspaceId, email])  // at most one live invite per email per workspace
  @@index([workspaceId])
  @@map("workspace_invites")
}
```

Add the back-relation `invites WorkspaceInvite[]` to `Workspace`.

The legacy invite fields on `WorkspaceMember` (`inviteToken`, `inviteEmail`, `inviteExpiry`, `invitedByUserId`, `acceptedAt`) become unused. Leave them in place for M1 (non-destructive); a later cleanup migration can drop them. `acceptedAt` continues to be set at member-creation time as it is today.

**Token handling:** generate `randomBytes(32).toString('hex')` as the raw token, store `sha256(raw)` in `tokenHash`, email the raw token in the link. Lookups hash the incoming token before querying — mirrors the password-reset pattern (`auth.service.ts`).

**Migration:** additive only (new table + enum + back-relation). No data backfill required.

## 5. Backend — `members` module

New module at `apps/api/src/modules/members/`, structured like `settings/` (`*.controller.ts`, `*.service.ts`, `*.module.ts`, `dto/`, `*.service.spec.ts`). A small separate public controller handles token endpoints.

### Permission matrix (M1)

| Action | OWNER | CO_MANAGER | VIEWER |
|---|---|---|---|
| Invite / cancel / resend invite | yes | no | no |
| Change member role | yes | no | no |
| Remove member | yes | no | no |
| List members / pending invites | yes | yes | yes |
| Leave family (self) | n/a (owner can't leave) | yes | yes |

Management actions use `@UseGuards(WorkspaceMemberGuard)` + `@Roles('OWNER')` + `RolesGuard` (same composition as `settings.controller.ts`). List endpoints use `WorkspaceMemberGuard` only.

### Workspace-scoped endpoints

- `POST /workspaces/:workspaceId/invites` — body `{ email, role }`.
  Guards/checks: workspace `tier === FAMILY` (else 403); seat check `activeMembers + pendingInvites < maxMembers` (else 409); reject if email is already a member or already has a `PENDING` invite (409). Creates `WorkspaceInvite`, sends invite email. Returns the created invite (no token).
- `GET /workspaces/:workspaceId/invites` — list `PENDING` invites: `{ id, email, role, invitedByUserId, expiresAt, createdAt }`.
- `DELETE /workspaces/:workspaceId/invites/:inviteId` — set status `REVOKED`.
- `POST /workspaces/:workspaceId/invites/:inviteId/resend` — regenerate token + `expiresAt`, keep `PENDING`, re-send email.
- `GET /workspaces/:workspaceId/members` — `{ id, userId, displayName, email, role, joinedAt, isSelf }`.
- `PATCH /workspaces/:workspaceId/members/:memberId` — body `{ role }`. Rules: cannot demote the only/last OWNER; cannot change own role.
- `DELETE /workspaces/:workspaceId/members/:memberId` — remove. Rule: cannot remove an OWNER (returns 400 with guidance to cancel the subscription instead).
- `DELETE /workspaces/:workspaceId/members/me` — leave; OWNER calling this gets 400.

### Public token endpoints

New `InvitesController`, routes `@Public()`, no workspace guard.

- `GET /invites/:token` — preview: `{ workspaceName, inviterName, email, role, state }` where `state ∈ valid | expired | revoked | accepted`. Never reveals workspace internals beyond name + inviter display name.
- `POST /invites/:token/accept` — **authenticated existing user.** Requires `currentUser.email === invite.email` (else 403, prevents invite forwarding). Re-checks seat (race guard, 409 if full). Creates `WorkspaceMember` (`role` from invite, `acceptedAt = now`), marks invite `ACCEPTED`. Idempotency: if the user is already a member, return success without duplicating.
- `POST /invites/:token/accept-signup` — **public, new user.** Body `{ displayName, password, timezone, baseCurrency }`; email comes from the invite (not the request body — locked). Creates user **+ personal workspace** (mirrors `register`, so the new user also gets "My finances") **+** `WorkspaceMember` in the family workspace, marks invite `ACCEPTED`, returns `AuthResult` (tokens). If an account with the invite email already exists → 409 directing them to the authenticated accept path.

All multi-write operations run in `prisma.$transaction`.

## 6. Email

Add to `apps/api/src/modules/email/`:

- `email.templates.ts`: `memberInviteEmail(inviterName, workspaceName, acceptUrl)` → `{ subject, html }`, matching the existing template style.
- `email.service.ts`: `sendMemberInvite(to, inviterName, workspaceName, acceptUrl)`.

Accept URL: `${WEB_URL}/invite/${rawToken}` (`WEB_URL` config already used by password reset). Send failures are logged, not thrown (same posture as verification email) — but the invite row is still created so it can be resent.

## 7. Auth + workspace switcher

**Backend:** add `GET /auth/workspaces` (authenticated) → `[{ workspaceId, name, slug, tier, role, baseCurrency }]` for all of the user's memberships. `login`/`register` response shapes are unchanged (still return the primary/oldest workspace as the default active), so existing clients keep working.

**Frontend store (`apps/web/src/lib/store.ts`):**
- Add `workspaces: WorkspaceSummary[]` and `activeWorkspaceId: string | null` (persisted to localStorage).
- Add `setActiveWorkspace(id)` which swaps the active `workspace` object that all existing API calls already read from (`workspace.id`).
- On login/register and app load, fetch `/auth/workspaces` to populate `workspaces`.

## 8. Frontend UI

Framework: Next.js 15 app router (confirmed).

- **`apps/web/src/app/invite/[token]/page.tsx`** — public accept page. Fetches preview; renders the matching message for non-`valid` states. If logged in → "Accept invitation" button → `accept`. If not logged in → signup form (email field locked to invite email) → `accept-signup`, plus an "already have an account? log in" path that returns to the accept action.
- **`MembersSection`** in Settings (rendered when active workspace `tier === FAMILY`): member list with role badges; invite form + role picker (OWNER only); pending-invites list with cancel/resend (OWNER only); per-member change-role + remove controls (OWNER only); "Leave family" button (non-owners).
- **`WorkspaceSwitcher`** component in the app header/nav — dropdown over `workspaces`, calls `setActiveWorkspace`.
- **`apps/web/src/lib/members-api.ts`** — typed client functions for every endpoint above, using the existing `authed()` helper, mirroring `billing-api.ts`.

## 9. Data flow — accept walkthroughs

**New user:** owner invites `a@x.com` → email → `/invite/<token>` → preview "Bola invited you to The Johnson Family (Viewer)" → user fills name + password → `POST /invites/<token>/accept-signup` → account + personal workspace + family membership created, tokens returned → app loads with switcher showing both workspaces.

**Existing user:** same link → preview → "Accept" (logs in first if needed; email must match invite) → `POST /invites/<token>/accept` → family membership added → switcher lists the family workspace alongside their own.

## 10. Error handling / edge cases

| Case | Response |
|---|---|
| Invite when workspace not on Family | 403 |
| Seat full (at invite or at accept) | 409 |
| Duplicate member or live invite for email | 409 |
| Accept email mismatch (existing user) | 403 |
| accept-signup but account already exists | 409 (use authenticated accept) |
| Expired / revoked / already-accepted token | preview `state`; accept → 410/409 |
| Remove or demote the last OWNER | 400 |
| Non-owner hits an OWNER-only action | 403 (RolesGuard) |
| OWNER calls "leave" | 400 |
| Invite-then-fill race fills the last seat | seat re-checked at accept → 409 |

## 11. Testing

- **Service unit tests** (mock Prisma, mirroring `settings.service.spec.ts` / `auth.service.spec.ts`): seat enforcement, duplicate detection, role-transition rules, owner protection, both accept paths, email-match, token expiry/revocation.
- **Token preview** state transitions.
- **Frontend:** extend `store.test.ts` for switcher logic; basic `members-api` shape coverage.
- Gate: `npm test`, `npm run build`, `npm run lint` all green before completion.

## 12. Out of scope (explicit)

- Role-enforcement sweep on existing finance endpoints (Milestone 2).
- Member deactivate/suspend (decided against).
- Combined cross-workspace financial rollups (each workspace is viewed independently via the switcher).
- Notifications beyond the invite email (e.g. "you were removed").
