import { z } from 'zod';
import { LOTTIE_KEYS } from '@finby/shared';

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

// Funnel query: which predefined funnel to render, and the conversion window (days).
export const funnelQuerySchema = z.object({
  funnel: z.enum(['activation', 'monetization']).default('activation'),
  windowDays: z.coerce.number().int().min(1).max(90).default(30),
});
export type FunnelQuery = z.infer<typeof funnelQuerySchema>;

// Users-list query: 1-based page, optional case-insensitive search term,
// optional plan filter (owned-workspace tier), and joined-date sort direction.
export const usersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  search: z.string().trim().max(200).optional(),
  plan: z.enum(['free', 'paid', 'PRO', 'PREMIUM', 'FAMILY']).optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
});
export type UsersQuery = z.infer<typeof usersQuerySchema>;

const announcementStepSchema = z.object({
  label: z.string().trim().min(1).max(120),
  caption: z.string().trim().min(1).max(200),
});

export const createAnnouncementSchema = z.object({
  key: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/, 'lowercase, digits, hyphens only'),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
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
