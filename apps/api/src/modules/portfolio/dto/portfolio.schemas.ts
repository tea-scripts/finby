import { z } from 'zod';

const positiveDecimal = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'must be a decimal string')
  .refine((v) => Number(v) > 0, 'must be greater than 0');

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/, 'must be an ISO date');

export const INVESTMENT_ACTIONS = ['BUY', 'SELL', 'DIVIDEND', 'SPLIT', 'ADD'] as const;

export const logEventSchema = z.object({
  ticker: z.string().trim().min(1).max(12).toUpperCase(),
  action: z.enum(INVESTMENT_ACTIONS),
  quantity: positiveDecimal,
  pricePerUnit: positiveDecimal,
  currency: z.string().trim().length(3).toUpperCase().default('USD'),
  eventDate: isoDate.optional(),
  notes: z.string().trim().max(1000).optional(),
});
export type LogEventInput = z.infer<typeof logEventSchema>;
