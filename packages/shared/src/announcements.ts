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
