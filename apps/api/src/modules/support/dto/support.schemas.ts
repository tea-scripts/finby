import { z } from 'zod';

export const SUPPORT_CATEGORIES = ['BUG', 'BILLING', 'ACCOUNT', 'FEATURE_REQUEST', 'OTHER'] as const;
export const SUPPORT_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const;

export const createSupportTicketSchema = z.object({
  category: z.enum(SUPPORT_CATEGORIES),
  subject: z.string().trim().min(1).max(160),
  message: z.string().trim().min(1).max(5000),
});
export type CreateSupportTicketInput = z.infer<typeof createSupportTicketSchema>;

export const updateSupportTicketSchema = z.object({
  status: z.enum(SUPPORT_STATUSES),
});
export type UpdateSupportTicketInput = z.infer<typeof updateSupportTicketSchema>;
