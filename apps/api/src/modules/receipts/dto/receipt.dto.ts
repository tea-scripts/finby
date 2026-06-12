import { z } from 'zod';

/**
 * Lenient boundary schema for the model's raw JSON. Required fields (merchant,
 * total) gate on what we cannot invent; everything else falls back to a safe
 * default so a slightly-off model response still produces a reviewable draft —
 * the user confirms (and can edit) every field before anything is logged.
 */
export const rawReceiptExtractionSchema = z.object({
  merchant: z.string().trim().min(1),
  total: z.number().positive(),
  currency: z.string().trim().length(3).toUpperCase().default('USD'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  category: z.string().trim().min(1).default('Other'),
  lineItems: z
    .array(z.object({ name: z.string().trim().min(1), amount: z.number() }))
    .default([]),
  confidence: z.number().min(0).max(1).default(0.5),
  isMixedCategories: z.boolean().default(false),
  notes: z.string().nullable().default(null),
});

export type RawReceiptExtraction = z.infer<typeof rawReceiptExtractionSchema>;

/** Response of POST /workspaces/:workspaceId/receipts/extract. */
export interface ReceiptExtraction {
  merchant: string;
  total: number;
  currency: string;
  /** YYYY-MM-DD */
  date: string;
  category: string;
  lineItems: Array<{ name: string; amount: number }>;
  confidence: number;
  isMixedCategories: boolean;
  /** Computed: total > 100 OR isMixedCategories — drives the review UI. */
  showLineItems: boolean;
  /** Present (true) when confidence < 0.5 — the UI shows a verify warning. */
  lowConfidence?: boolean;
  notes: string | null;
}
