import { z } from 'zod';

/** A browser PushSubscription as serialized by the Push API. */
export const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});
export type SubscribeInput = z.infer<typeof subscribeSchema>;

export const unsubscribeSchema = z.object({
  endpoint: z.string().min(1),
});
export type UnsubscribeInput = z.infer<typeof unsubscribeSchema>;
