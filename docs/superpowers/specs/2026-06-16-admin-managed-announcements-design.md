# Admin-Managed Feature Announcements — Design

> **Date**: 2026-06-16
> **Status**: Approved (pending spec review)
> **Branch**: `feature/admin-managed-announcements` (branch from `main`)
> **Supersedes the client-only model in**: `2026-06-12-in-app-announcements-design.md`

## Problem

Feature announcements are currently **hardcoded** in `apps/web/src/lib/announcements.ts` as a
static `Announcement[]` array. Shipping a new announcement means a code change and a web deploy,
and there is no targeting, scheduling, or performance visibility.

We want the **super-admin** to author, schedule, target, order, publish, and measure feature
announcements from the existing admin dashboard (`apps/admin`, `admin.finby.app`) — and we want the
four announcements that exist today to move into that system without any visible change to existing
users (nobody re-sees what they already dismissed).

## Goals

- Admins create / edit / publish / delete announcements from the dashboard — no code or web deploy.
- Full content parity with today's hardcoded set: `simple`/`steps` modes, title, body, emoji,
  **Lottie** illustration, hashtag, confetti, steps editor, and the `dismiss` / `enable-push` CTA.
- Lifecycle: Draft vs Published, optional publish + expiry dates, manual ordering.
- Audience: optional subscription-tier targeting (Free / Pro / Premium / Family / everyone).
- Analytics: per-announcement **impressions + dismissals**, shown in the admin list.
- The four existing announcements are migrated into the DB; existing dismissals are preserved.

## Non-goals

- Per-user/segment targeting beyond subscription tier.
- Admin upload of new Lottie artwork (new animations remain a small dev task — see Lottie Registry).
- A/B testing or multivariate experiments.
- Rich-text/markdown body (plain text, as today).

## Chosen approach: fully server-driven (Approach 1)

The server owns selection and interaction state. The web app stops deciding *what* to show and
stops writing dismissal state into `preferences`; it just renders what the API hands it and reports
seen/dismiss. This is the only approach where tier targeting and manual ordering are enforced
authoritatively, and it yields clean, de-duplicated analytics from a single source of truth.

Rejected alternatives:
- **DB content + client still decides** (`pickAnnouncement` + `preferences.dismissedAnnouncements`
  retained): smallest web change, but duplicates dismissal state and pushes targeting/ordering onto
  the client.
- **Hybrid (preferences decides, events log analytics)**: no backfill, but selection stays
  client-side and dismissal lives in two systems long-term.

---

## Data model — `apps/api/prisma/schema.prisma`

Two new tables, three new enums. The `key` field is the continuity linchpin: each existing
announcement is seeded with its current string id as `key`, and the dismissal backfill matches on it.

```prisma
enum AnnouncementStatus      { DRAFT  PUBLISHED }
enum AnnouncementMode        { SIMPLE STEPS }
enum AnnouncementPrimaryKind { DISMISS ENABLE_PUSH }

model Announcement {
  id           String   @id @default(cuid())
  key          String   @unique          // stable slug e.g. "streaks-2026-06" — preserves dismissal continuity
  status       AnnouncementStatus      @default(DRAFT)
  mode         AnnouncementMode        @default(SIMPLE)
  title        String
  body         String
  emoji        String?
  imageUrl     String?
  lottieKey    String?                  // references the shared Lottie registry by key
  hashtag      String?
  confetti     Boolean  @default(false)
  steps        Json?                    // AnnouncementStep[] = [{ label, caption }]
  primaryLabel String
  primaryKind  AnnouncementPrimaryKind  @default(DISMISS)
  targetTier   SubscriptionTier?        // null = all tiers; enum already exists { FREE PRO PREMIUM FAMILY }
  order        Int      @default(0)     // manual ordering; lower shows first
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

  @@unique([announcementId, userId])     // one row per user×announcement; de-dupes impressions
  @@index([announcementId])
}
```

Plus a back-relation on `User`: `announcementInteractions AnnouncementInteraction[]`.

**Analytics are derived, not denormalized**: per announcement, `seenCount = count(interactions)` and
`dismissedCount = count(interactions where dismissedAt != null)`. No counter columns to keep in sync.

### Tier resolution

`SubscriptionTier` lives on `Workspace.tier` (not on `User`). A user's effective tier is the tier of
the workspace they OWN (per the existing pattern in `admin-users.service.ts`: OWNER membership →
`workspace.tier`). The active-selection query resolves the caller's tier this way and matches it
against `targetTier` (`null` = everyone).

---

## API contract

### Public (authed user) — new `AnnouncementsModule` in `apps/api/src/modules/announcements/`

| Method | Route | Purpose |
|---|---|---|
| `GET`  | `/announcements/active` | Returns the **single** next announcement for the caller, or `null`. Filters: `status = PUBLISHED`, `publishAt ≤ now < expiresAt` (nulls = unbounded), `targetTier ∈ { null, caller's tier }`, and no interaction row for this user with `dismissedAt` set. Ordered by `order` asc, then `createdAt` asc. Response: `{ announcement: AnnouncementView \| null }`. |
| `POST` | `/announcements/:id/seen` | Upserts the interaction row (`@@unique(announcementId,userId)`), stamping `seenAt` on first view. Idempotent. |
| `POST` | `/announcements/:id/dismiss` | Upserts + sets `dismissedAt`. Replaces the old `preferences.dismissedAnnouncements` write. Idempotent. |

`AnnouncementView` is the client-facing shape (mirrors today's `Announcement` type): `id`, `mode`,
`title`, `body`, `emoji?`, `imageUrl?`, `lottieKey?`, `hashtag?`, `confetti`, `steps?`,
`primary: { label, kind }`, `expiresAt?`.

### Admin (`@Public() @UseGuards(AdminJwtGuard)`) — `/admin/announcements`

Mirrors the existing tickets controller/service pattern exactly.

| Method | Route | Purpose |
|---|---|---|
| `GET`    | `/admin/announcements`        | List **all** (drafts included), each with derived `seenCount` / `dismissedCount`. Ordered by `order`, then `createdAt`. |
| `GET`    | `/admin/announcements/assets` | Returns the Lottie registry `[{ key, label, path }]` for the picker (so the admin app never imports web internals). |
| `POST`   | `/admin/announcements`        | Create. Zod-validated. |
| `PATCH`  | `/admin/announcements/:id`    | Update content / lifecycle / order / targeting. |
| `DELETE` | `/admin/announcements/:id`    | Delete (cascades interactions). |

DTOs are Zod schemas in `apps/api/src/modules/admin/dto/admin.schemas.ts`. `steps` validated as an
array of `{ label, caption }`; `lottieKey` validated against the registry keys; `primaryKind` enum;
`targetTier` optional enum. Throttling matches existing admin endpoints (60/min).

---

## Lottie registry (shared)

New `packages/shared/src/announcement-assets.ts` — single source of truth for bundled animations:

```ts
export const LOTTIE_REGISTRY = [
  { key: 'streak-flame',  label: 'Streak flame',  path: '/lottie/streak-flame.json' },
  { key: 'notif-bell',    label: 'Notification bell', path: '/lottie/notif-bell.json' },
  { key: 'receipt-scan',  label: 'Receipt scan',   path: '/lottie/receipt-scan.json' },
  { key: 'account-cards', label: 'Account cards',  path: '/lottie/account-cards.json' },
] as const;

export function lottiePathForKey(key: string | null | undefined): string | null { /* ... */ }
```

- **Web** resolves `announcement.lottieKey → path` via the registry when rendering the modal.
- **Admin** fetches the registry from `GET /admin/announcements/assets` and renders a `Dropdown`
  with a small live Lottie preview.
- **New artwork** stays a ~2-line dev task: drop the `.json` in `apps/web/public/lottie/`, add a
  registry entry. After that it is permanently admin-selectable.

---

## Web client refactor — `apps/web`

Smallest footprint that retires the hardcoded array while leaving the modal/confetti UI untouched.

- `lib/announcements.ts`: keep the `Announcement` type (now the API view shape). **Delete** the
  static `ANNOUNCEMENTS` array and `pickAnnouncement` — selection is server-side now.
- New `lib/announcements-api.ts`: `getActiveAnnouncement()`, `markSeen(id)`, `markDismissed(id)`
  over the existing `authed` wrapper (`lib/settings-api.ts` style).
- `components/announcements/announcement-host.tsx`: on mount call `getActiveAnnouncement()`; if
  present, render the **existing** `AnnouncementModal` and fire `markSeen(id)`. Primary:
  `dismiss` → `markDismissed(id)`; `enable-push` → `enablePush(workspace.id)` then `markDismissed(id)`
  (unchanged ordering). "Remind me later" → session-only close (unchanged). Lottie path resolved via
  the shared registry. On API failure, render nothing (no crash) — same defensive posture as today.
- `preferences.dismissedAnnouncements` is **read-only during the transition** (the backfill consumes
  it); the web no longer writes to it. The field is **not** removed from the schema — non-destructive.

---

## Admin dashboard UI — `apps/admin`

Mirrors the Tickets + Users precedent.

- `lib/api.ts`: add `announcements()`, `announcementAssets()`, `createAnnouncement(body)`,
  `updateAnnouncement(id, body)`, `deleteAnnouncement(id)`.
- `app/announcements/page.tsx` wrapped in `<AuthGate>`; add an "Announcements" entry to the
  `AdminShell` `NAV` array.
- `components/AnnouncementsTable.tsx`: list with `seen · dismissed` counts, a Draft/Published status
  pill, target tier, and order; per-row edit/delete; a "New announcement" button. Fetch-on-mount +
  refresh-after-mutation with the stale-guard pattern from `UsersTable`/`TicketsTable`.
- `components/AnnouncementForm.tsx` (drawer/modal): full-parity editor built from the admin UI kit
  (`Input`, `Dropdown`, `Field`, `Button`) plus:
  - a `Toggle` for confetti (add one to `apps/admin/src/components/ui/` if absent — no native
    checkbox, per Finby's UI rule),
  - a repeatable **steps editor** (add/remove `{ label, caption }` rows) shown only for `mode=steps`,
  - the **Lottie picker** `Dropdown` (from the assets endpoint) with a live preview,
  - `Dropdown`s for mode / primaryKind / targetTier / status,
  - publish/expiry date inputs using the admin app's existing input pattern (no native `<select>`).

---

## Migration / seed / backfill — `apps/api`

One Prisma migration (two tables + three enums) plus idempotent boot-time seeding alongside the
existing category seed (`prisma/seed.ts` / `PrismaService.onModuleInit`, following the existing
pattern).

- **Seed the 4 existing announcements** via `upsert` on `key`
  (`streaks-2026-06`, `in-app-notifs-2026-06`, `receipt-scanning-2026-06`, `accounts-2026-06`) with
  `status = PUBLISHED`, preserving their current content, `lottieKey`, `steps`, `confetti`,
  `primaryKind`, and an `order` matching today's array order. Idempotent — safe every deploy.
- **One-time dismissal backfill**: for each user with `preferences.dismissedAnnouncements`, upsert an
  `AnnouncementInteraction(dismissedAt = now())` for each entry whose value matches a seeded
  announcement `key`. Guarded to run its work once (skip users already backfilled, e.g. via a
  marker preference flag or by checking for existing interaction rows). This makes the cutover
  invisible to existing users.

---

## Testing

All test-first where practical, mirroring existing `*.spec.ts` / `*.test.tsx`.

**API (`apps/api`)**
- `AnnouncementsService` active-selection: tier match/`null`, publish/expiry window boundaries,
  exclusion of dismissed, ordering by `order` then `createdAt`, returns `null` when none.
- `seen` / `dismiss` idempotency (unique-row upsert; repeated calls don't duplicate or regress).
- Dismissal backfill: maps matching keys, skips non-matching, runs once.
- `AdminAnnouncementsService` CRUD + derived `seenCount`/`dismissedCount`.
- Zod schema validation (steps shape, lottieKey in registry, enums).

**Web (`apps/web`)**
- Rewrite `announcement-host.test.tsx` against the API client (mock `getActiveAnnouncement`,
  `markSeen`, `markDismissed`): renders the returned announcement, fires `markSeen`, persists
  dismiss, runs the enable-push path, remind-later closes session-only, renders nothing on `null`.
- `announcement-modal.test.tsx` stays (UI unchanged).
- Delete the obsolete `pickAnnouncement` tests in `lib/announcements.test.ts`.

**Admin (`apps/admin`)**
- `AnnouncementsTable`: renders counts/status, triggers delete, refreshes after mutation.
- `AnnouncementForm`: validates required fields, steps editor add/remove, Lottie picker selection,
  submits create + update payloads.

**Gates (all must pass):** `pnpm --filter finby-api test`, `pnpm --filter finby-web test`, the admin
test suite, and clean builds for api / web / admin. No `any` introduced.

---

## Rollout / done criteria

- [ ] Migration applied; `Announcement` + `AnnouncementInteraction` tables exist.
- [ ] After API boot, the 4 existing announcements exist as `PUBLISHED` rows (idempotent on re-deploy).
- [ ] Existing users do **not** re-see announcements they already dismissed (backfill verified).
- [ ] Admin can create a Draft, preview Lottie, publish it, and it appears in the web app.
- [ ] Tier targeting honored: a Pro-only announcement is not returned to a Free user.
- [ ] Publish/expiry windows and manual order honored by `/announcements/active`.
- [ ] Admin list shows accurate `seen · dismissed` counts.
- [ ] `enable-push` announcements still trigger the browser permission flow.
- [ ] No native form controls in admin feature code; admin UI-kit components only.
- [ ] All test + build gates green; no `any`.
