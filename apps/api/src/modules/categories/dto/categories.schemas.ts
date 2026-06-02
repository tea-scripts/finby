import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().trim().max(20).optional(),
  icon: z.string().trim().max(40).optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  color: z.string().trim().max(20).optional(),
  icon: z.string().trim().max(40).optional(),
  isArchived: z.boolean().optional(),
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
