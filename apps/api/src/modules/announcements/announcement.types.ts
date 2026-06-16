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
