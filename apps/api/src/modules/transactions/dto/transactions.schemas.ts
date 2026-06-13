import { z } from 'zod';

const positiveDecimal = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'must be a decimal string')
  .refine((v) => Number(v) > 0, 'must be greater than 0');

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/, 'must be an ISO date');

export const TRANSACTION_TYPES = ['EXPENSE', 'INCOME', 'TRANSFER'] as const;

export const createTransactionSchema = z
  .object({
    type: z.enum(TRANSACTION_TYPES),
    amountOriginal: positiveDecimal,
    currencyOriginal: z.string().trim().length(3).toUpperCase(),
    categoryId: z.string().optional(),
    accountId: z.string().optional(),
    toAccountId: z.string().optional(),
    merchant: z.string().trim().max(200).optional(),
    description: z.string().trim().max(1000).optional(),
    transactionDate: isoDate.optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  })
  .refine((data) => data.type !== 'TRANSFER' || (!!data.accountId && !!data.toAccountId), {
    message: 'TRANSFER requires both accountId and toAccountId',
    path: ['toAccountId'],
  });
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

export const updateTransactionSchema = z.object({
  categoryId: z.string().nullable().optional(),
  // Re-attribute the transaction to a different account (or detach with null).
  // Reconciles account balances and enforces the account/transaction currency match.
  accountId: z.string().nullable().optional(),
  merchant: z.string().trim().max(200).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  transactionDate: isoDate.optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
});
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;

export const listTransactionsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  type: z.enum(TRANSACTION_TYPES).optional(),
  categoryId: z.string().optional(),
  fromDate: isoDate.optional(),
  toDate: isoDate.optional(),
  currency: z.string().trim().length(3).toUpperCase().optional(),
  search: z.string().trim().max(200).optional(),
});
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
