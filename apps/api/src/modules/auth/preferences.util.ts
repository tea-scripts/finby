import { z } from 'zod';
import { DEFAULT_PREFERENCES, type UserPreferences } from '@finby/shared';

/** Partial preferences validator — reused by the profile PATCH (Task B4)
 *  to validate incoming preference patches. */
export const preferencesSchema = z
  .object({
    dateFormat: z.enum(['MEDIUM', 'SHORT', 'ISO']),
    numberFormat: z.enum(['GROUPED', 'PLAIN']),
    currencyDisplay: z.enum(['SYMBOL', 'CODE']),
    dailyReminders: z.boolean(),
    lastDailyReminderAt: z.string().nullable(),
  })
  .partial();

/** Merge stored JSON preferences over the defaults; invalid/missing → defaults. */
export function parsePreferences(json: unknown): UserPreferences {
  const parsed = preferencesSchema.safeParse(json);
  return { ...DEFAULT_PREFERENCES, ...(parsed.success ? parsed.data : {}) };
}
