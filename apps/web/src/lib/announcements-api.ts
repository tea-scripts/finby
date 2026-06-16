import { lottiePathForKey, type AnnouncementView } from '@finby/shared';
import { useAuth } from './store';
import type { Announcement } from './announcements';

function authed<T>(path: string, init?: RequestInit): Promise<T> {
  const { authed: call } = useAuth.getState();
  return init === undefined ? call<T>(path) : call<T>(path, init);
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
