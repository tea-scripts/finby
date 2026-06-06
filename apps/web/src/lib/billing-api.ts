import { apiFetch } from './api-client';
import { useAuth } from './store';
import type { BillingPlan, SubscriptionTier, SubscriptionView } from './types';

function authed<T>(path: string, init?: RequestInit): Promise<T> {
  return useAuth.getState().authed<T>(path, init);
}

export function getSubscription(workspaceId: string): Promise<SubscriptionView> {
  return authed<SubscriptionView>(`/workspaces/${workspaceId}/subscription`);
}

export function getPlans(): Promise<{ plans: BillingPlan[] }> {
  return apiFetch<{ plans: BillingPlan[] }>(`/billing/plans`);
}

export function startCheckout(
  workspaceId: string,
  tier: Exclude<SubscriptionTier, 'FREE'>,
): Promise<{ url: string }> {
  return authed<{ url: string }>(`/workspaces/${workspaceId}/subscription/checkout`, {
    method: 'POST',
    body: JSON.stringify({ tier }),
  });
}

export function openPortal(workspaceId: string): Promise<{ url: string }> {
  return authed<{ url: string }>(`/workspaces/${workspaceId}/subscription/portal`, {
    method: 'POST',
  });
}

export function cancelSubscription(workspaceId: string): Promise<SubscriptionView> {
  return authed<SubscriptionView>(`/workspaces/${workspaceId}/subscription/cancel`, {
    method: 'POST',
  });
}

export function resumeSubscription(workspaceId: string): Promise<SubscriptionView> {
  return authed<SubscriptionView>(`/workspaces/${workspaceId}/subscription/resume`, {
    method: 'POST',
  });
}
