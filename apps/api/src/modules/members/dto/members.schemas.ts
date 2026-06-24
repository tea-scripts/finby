import { z } from 'zod';

export const createInviteSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  role: z.enum(['CO_MANAGER', 'VIEWER']).default('VIEWER'),
});
export type CreateInviteInput = z.infer<typeof createInviteSchema>;

export const changeRoleSchema = z.object({
  role: z.enum(['CO_MANAGER', 'VIEWER']),
});
export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;

export const acceptSignupSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(200),
  baseCurrency: z.string().trim().length(3).toUpperCase().default('USD'),
  timezone: z.string().trim().min(1).default('UTC'),
  // ToS version the invited user accepted — required, recorded as consent evidence.
  acceptedTermsVersion: z.string().trim().min(1).max(64),
});
export type AcceptSignupInput = z.infer<typeof acceptSignupSchema>;
