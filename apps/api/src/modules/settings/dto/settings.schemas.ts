import { z } from 'zod';

export const updateCurrenciesSchema = z.object({
  currencies: z.array(z.string().trim().toUpperCase()).min(1).max(20),
});

export type UpdateCurrenciesInput = z.infer<typeof updateCurrenciesSchema>;

export const updateBaseCurrencySchema = z.object({
  baseCurrency: z.string().trim().length(3).toUpperCase(),
});

export type UpdateBaseCurrencyInput = z.infer<typeof updateBaseCurrencySchema>;
