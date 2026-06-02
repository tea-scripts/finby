import { z } from 'zod';

export const listAlertsQuerySchema = z.object({
  status: z.enum(['UNREAD', 'READ', 'DISMISSED']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListAlertsQuery = z.infer<typeof listAlertsQuerySchema>;

export const updateAlertSchema = z.object({
  status: z.enum(['READ', 'DISMISSED']),
});
export type UpdateAlertInput = z.infer<typeof updateAlertSchema>;
