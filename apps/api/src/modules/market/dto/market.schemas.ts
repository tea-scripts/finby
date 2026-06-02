import { z } from 'zod';

export const marketSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(50),
});
export type MarketSearchQuery = z.infer<typeof marketSearchQuerySchema>;
