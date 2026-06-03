import type { SubscriptionTier } from '@finby/shared';

export type BillingProviderName = 'STRIPE' | 'PAYSTACK';
export type SubscriptionStatusP5 = 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELED' | 'PAUSED';

export interface CheckoutParams {
  workspaceId: string;
  tier: Exclude<SubscriptionTier, 'FREE'>;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  url: string;
}

/** Normalized webhook event — providers translate their native events to this. */
export interface BillingWebhookEvent {
  type: 'SUBSCRIPTION_ACTIVE' | 'SUBSCRIPTION_CANCELED' | 'SUBSCRIPTION_UPDATED' | 'IGNORED';
  workspaceId: string | null;
  tier: SubscriptionTier | null;
  status: SubscriptionStatusP5;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
}

/** Provider-agnostic billing port. Native SDKs live only in the provider files. */
export interface BillingProvider {
  readonly name: BillingProviderName;
  createCheckout(params: CheckoutParams): Promise<CheckoutResult>;
  parseWebhook(rawBody: Buffer | string, signature: string): Promise<BillingWebhookEvent>;
  cancelAtPeriodEnd(providerSubscriptionId: string, cancel: boolean): Promise<void>;
}

export interface SubscriptionView {
  tier: SubscriptionTier;
  status: SubscriptionStatusP5;
  billingProvider: BillingProviderName | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}
