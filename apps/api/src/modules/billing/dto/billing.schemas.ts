import { z } from 'zod';

export const checkoutSchema = z.object({
  tier: z.enum(['PRO', 'PREMIUM', 'FAMILY']),
  provider: z.enum(['STRIPE', 'PAYSTACK', 'LEMONSQUEEZY']).default('STRIPE'),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;
