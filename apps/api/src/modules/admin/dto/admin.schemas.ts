import { z } from 'zod';

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
