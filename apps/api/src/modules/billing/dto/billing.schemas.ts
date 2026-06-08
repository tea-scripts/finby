import { z } from 'zod';

export const checkoutSchema = z.object({
  tier: z.enum(['PRO', 'PREMIUM', 'FAMILY']),
  provider: z.enum(['STRIPE', 'PAYSTACK', 'LEMONSQUEEZY']).default('STRIPE'),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const changePlanSchema = z.object({
  tier: z.enum(['PRO', 'PREMIUM', 'FAMILY']),
});
export type ChangePlanInput = z.infer<typeof changePlanSchema>;
