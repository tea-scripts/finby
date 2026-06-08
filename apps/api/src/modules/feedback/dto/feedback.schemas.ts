import { z } from 'zod';

export const createFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
});
export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
