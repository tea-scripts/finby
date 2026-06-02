import { z } from 'zod';

const positiveDecimal = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'must be a decimal string')
  .refine((v) => Number(v) > 0, 'must be greater than 0');

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/, 'must be an ISO date');

export const BUDGET_PERIODS = ['MONTHLY', 'WEEKLY', 'QUARTERLY', 'ANNUAL'] as const;

export const createBudgetSchema = z.object({
  categoryId: z.string().min(1),
  amountLimit: positiveDecimal,
  period: z.enum(BUDGET_PERIODS).default('MONTHLY'),
  periodStart: isoDate.optional(),
});
export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;

export const updateBudgetSchema = z.object({
  amountLimit: positiveDecimal.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;

export const listBudgetsQuerySchema = z.object({
  periodStart: isoDate.optional(),
});
export type ListBudgetsQuery = z.infer<typeof listBudgetsQuerySchema>;
