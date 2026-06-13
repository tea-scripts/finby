import { z } from 'zod';
import { ACCOUNT_TYPES } from '@finby/shared';

const decimalString = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'must be a non-negative decimal string');

export { ACCOUNT_TYPES };

export const createAccountSchema = z.object({
  name: z.string().trim().min(1).max(120),
  currency: z.string().trim().length(3).toUpperCase(),
  accountType: z.enum(ACCOUNT_TYPES),
  initialBalance: decimalString.default('0'),
  color: z.string().trim().max(20).optional(),
  icon: z.string().trim().max(40).optional(),
});
export type CreateAccountInput = z.infer<typeof createAccountSchema>;

export const updateAccountSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  color: z.string().trim().max(20).optional(),
  icon: z.string().trim().max(40).optional(),
  isArchived: z.boolean().optional(),
});
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
