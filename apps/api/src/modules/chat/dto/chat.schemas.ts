import { z } from 'zod';

export const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const listMessagesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  includeToolMessages: z.coerce.boolean().default(false),
});
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
