import { z } from 'zod';

export const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/** Pre-composed assistant note (e.g. the receipt-scan confirmation bubble). */
export const assistantNoteSchema = z.object({
  content: z.string().trim().min(1).max(500),
});
export type AssistantNoteInput = z.infer<typeof assistantNoteSchema>;

export const listMessagesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  includeToolMessages: z.coerce.boolean().default(false),
});
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
