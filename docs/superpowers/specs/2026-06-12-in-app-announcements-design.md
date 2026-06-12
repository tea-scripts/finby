# In-App Announcements — Design

## Goal

A reusable, cinematic in-app announcement system to surface product news (e.g. the
streaks launch) and nudge engagement (e.g. turning on push notifications). Each
announcement is a full-screen branded modal with an animated illustration, shown
once per user until dismissed.

## Decisions (from brainstorming)

- **Templated modal** with two layouts: `simple` (branded card) and `steps`
  (numbered how-to).
- **Code-defined** announcements (a typed config array in the web app). No DB, no
  admin UI.
- **Server-side dismissal** stored in `user.preferences.dismissedAnnouncements`
  (same pattern as `lastDailyReminderAt`), updated via the existing
  `PATCH /auth/profile`.
- **Notifications CTA triggers the permission prompt directly** via the existing
  `enablePush()`.
- **Cinematic Lottie** illustrations, especially the streak flame.

## Architecture

No new backend endpoints. Content + interaction live on the frontend; dismissal
persists through the existing profile-preferences plumbing.

### Backend (minimal)

- `packages/shared/src/types.ts`: `UserPreferences.dismissedAnnouncements: string[]`.
- `packages/shared/src/constants.ts`: `DEFAULT_PREFERENCES.dismissedAnnouncements = []`.
- `apps/api/src/modules/auth/preferences.util.ts`: add
  `dismissedAnnouncements: z.array(z.string())` to `preferencesSchema` so the
  partial PATCH validates and persists it.
- `updateProfile` already merges `{ ...current, ...patch }` (array replace) — no
  change needed.

### Frontend

- `lib/announcements.ts` — typed config + a pure `pickAnnouncement(list, dismissedIds, now)`
  selector returning the first active, non-expired, undismissed announcement.
- `components/announcements/confetti.tsx` — zero-dependency CSS burst, returns
  null under `prefers-reduced-motion`.
- `components/announcements/announcement-modal.tsx` — presentational full-screen
  overlay. Illustration priority: `lottie` → `image` → `emoji`. Renders `simple`
  or `steps`. Props: `announcement`, `onPrimary`, `onRemindLater`, `busy`.
- `components/announcements/announcement-host.tsx` — controller mounted once in
  the authed shell. Picks the announcement, wires the actions, persists dismissal.

### Announcement shape

```ts
interface Announcement {
  id: string;
  mode: 'simple' | 'steps';
  title: string;
  body: string;
  emoji?: string;
  image?: string;
  lottie?: string;          // /public path; rendered via <Lottie>
  hashtag?: string;         // small eyebrow label
  confetti?: boolean;       // celebratory burst on open
  steps?: { label: string; caption: string }[];   // steps mode
  primary: { label: string; kind: 'dismiss' | 'enable-push' };
  expiresAt?: string;       // optional ISO auto-expiry
}
```

## Behavior

- **One at a time**, max one per app load (first match from the ordered list).
- **Primary `dismiss` / "Got it"** → `updateProfile({ preferences: { dismissedAnnouncements: [...prev, id] } })` → `setUser(result)` → close.
- **Primary `enable-push`** → run `enablePush(workspace.id)` (browser prompt), then
  persist dismissal so it won't nag again (whatever the permission outcome).
- **"Remind me later"** → close for this session only (local component state);
  reappears on next app load.
- Mounted in `app/(app)/layout.tsx`, so it only renders when authed with a workspace.

## Visual & animation layer

- **Entrance**: backdrop fades in; card uses a new `pop-in` keyframe (scale 0.92→1
  + fade) with the existing `cubic-bezier(0.22,1,0.36,1)` easing. `steps` stagger-fade in.
- **Celebration**: optional pulsing glow (`shadow-glow`) behind the illustration +
  confetti burst (streaks use it).
- **Lottie**: hand-authored `streak-flame.json` (layered glow + flickering flame +
  inner core + rising sparks) and `notif-bell.json` (ringing bell + sound-wave arcs
  + notification dot), in `public/lottie/`, rendered through the existing `<Lottie>`
  wrapper.
- **Reduced motion**: `<Lottie>` already no-ops; entrance/confetti gated with
  `motion-reduce:animate-none`. Reduced-motion users get the full static modal.

## Launch content

- `streaks-2026-06` — `simple`, flame Lottie, `confetti: true`, primary **Got it**.
- `in-app-notifs-2026-06` — `steps`, bell Lottie, 1-2-3 how-to, primary
  **Turn on notifications** (`enable-push`).

## Testing (TDD)

- `pickAnnouncement`: skips dismissed, skips expired, returns first match, null when none.
- `AnnouncementModal`: renders `simple` vs `steps`; illustration priority;
  primary/remind-later callbacks fire; confetti only when flagged.
- `AnnouncementHost`: picks first undismissed; hides when all dismissed/expired;
  "Got it" persists via `updateProfile`; `enable-push` calls `enablePush`;
  "Remind me later" closes without persisting.
- Backend: `preferencesSchema` accepts `dismissedAnnouncements`; `parsePreferences`
  defaults it to `[]`.
- Lottie files: structurally valid JSON with required top-level keys (visual polish
  verified manually in-app).

## Scope guardrails (YAGNI)

No admin UI, no DB table, no per-tier targeting, no analytics beyond existing
`track()`. All deferrable.
