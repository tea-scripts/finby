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
