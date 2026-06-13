import { z } from 'zod';
import { SUPPORT_CATEGORIES, SUPPORT_STATUSES } from '@finby/shared';

export { SUPPORT_CATEGORIES, SUPPORT_STATUSES };

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

export const adminTicketListQuerySchema = z.object({
  status: z.enum(SUPPORT_STATUSES).optional(),
});
export type AdminTicketListQuery = z.infer<typeof adminTicketListQuerySchema>;
