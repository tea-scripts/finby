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

// Users-list query: 1-based page plus optional case-insensitive search term.
export const usersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  search: z.string().trim().max(200).optional(),
});
export type UsersQuery = z.infer<typeof usersQuerySchema>;
