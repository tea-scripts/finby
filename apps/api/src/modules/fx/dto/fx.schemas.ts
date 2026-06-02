import { z } from 'zod';

export const fxRateQuerySchema = z.object({
  from: z.string().trim().length(3).toUpperCase(),
  to: z.string().trim().length(3).toUpperCase(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
    .optional(),
});
export type FxRateQuery = z.infer<typeof fxRateQuerySchema>;
