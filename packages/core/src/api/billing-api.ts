import type { BillingPlan, SubscriptionTier, SubscriptionView } from '@finby/shared';
import type { ApiFetch, AuthedFetch } from './contract';

export interface BillingApi {
  getSubscription(workspaceId: string): Promise<SubscriptionView>;
  getPlans(): Promise<{ plans: BillingPlan[] }>;
  startCheckout(workspaceId: string, tier: Exclude<SubscriptionTier, 'FREE'>): Promise<{ url: string }>;
  openPortal(workspaceId: string): Promise<{ url: string }>;
  changePlan(workspaceId: string, tier: Exclude<SubscriptionTier, 'FREE'>): Promise<SubscriptionView>;
  cancelSubscription(workspaceId: string): Promise<SubscriptionView>;
  resumeSubscription(workspaceId: string): Promise<SubscriptionView>;
}

export function createBillingApi(deps: { authed: AuthedFetch; apiFetch: ApiFetch }): BillingApi {
  const { authed, apiFetch } = deps;
  return {
    getSubscription(workspaceId) {
      return authed<SubscriptionView>(`/workspaces/${workspaceId}/subscription`);
    },
    getPlans() {
      return apiFetch<{ plans: BillingPlan[] }>(`/billing/plans`);
    },
    startCheckout(workspaceId, tier) {
      return authed<{ url: string }>(`/workspaces/${workspaceId}/subscription/checkout`, {
        method: 'POST',
        body: JSON.stringify({ tier }),
      });
    },
    openPortal(workspaceId) {
      return authed<{ url: string }>(`/workspaces/${workspaceId}/subscription/portal`, {
        method: 'POST',
      });
    },
    changePlan(workspaceId, tier) {
      return authed<SubscriptionView>(`/workspaces/${workspaceId}/subscription/change-plan`, {
        method: 'POST',
        body: JSON.stringify({ tier }),
      });
    },
    cancelSubscription(workspaceId) {
      return authed<SubscriptionView>(`/workspaces/${workspaceId}/subscription/cancel`, {
        method: 'POST',
      });
    },
    resumeSubscription(workspaceId) {
      return authed<SubscriptionView>(`/workspaces/${workspaceId}/subscription/resume`, {
        method: 'POST',
      });
    },
  };
}
