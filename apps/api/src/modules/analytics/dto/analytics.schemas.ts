import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/, 'must be an ISO date');

export const summaryQuerySchema = z.object({
  from: isoDate,
  to: isoDate,
});
export type SummaryQuery = z.infer<typeof summaryQuerySchema>;

export const byCategoryQuerySchema = z.object({
  from: isoDate,
  to: isoDate,
  type: z.enum(['EXPENSE', 'INCOME']).default('EXPENSE'),
});
export type ByCategoryQuery = z.infer<typeof byCategoryQuerySchema>;

export const trendQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6),
});
export type TrendQuery = z.infer<typeof trendQuerySchema>;

/** Insight is month-scoped: the reported month is derived from `from` (its
 *  calendar month), and the current-vs-prior comparison + projection are
 *  computed from that. `to` is accepted for call-signature uniformity with
 *  summary/by-category but is NOT read by the service. */
export const insightQuerySchema = z.object({
  from: isoDate,
  to: isoDate,
});
export type InsightQuery = z.infer<typeof insightQuerySchema>;
