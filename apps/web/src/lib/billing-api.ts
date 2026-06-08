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

export function changePlan(
  workspaceId: string,
  tier: Exclude<SubscriptionTier, 'FREE'>,
): Promise<SubscriptionView> {
  return authed<SubscriptionView>(`/workspaces/${workspaceId}/subscription/change-plan`, {
    method: 'POST',
    body: JSON.stringify({ tier }),
  });
}

/**
 * Open a Stripe billing URL (resolved asynchronously) in a separate browser tab.
 *
 * In a standalone PWA on iOS, navigating the app's own context to an external
 * URL opens an in-app browser overlay; dismissing it (the X) corrupts the PWA's
 * viewport and navigation. Opening in a new tab keeps the installed app intact.
 *
 * The blank tab is opened *synchronously* inside the click handler so Safari
 * preserves the user gesture and does not block the popup — its location is set
 * once the async URL resolves. If the popup is blocked (no handle), fall back to
 * a same-context redirect so the action still works.
 */
export async function openBillingUrl(resolveUrl: () => Promise<string>): Promise<void> {
  const tab = typeof window !== 'undefined' ? window.open('', '_blank') : null;
  if (tab) {
    tab.opener = null;
  }
  try {
    const url = await resolveUrl();
    if (tab) {
      tab.location.href = url;
    } else if (typeof window !== 'undefined') {
      window.location.href = url;
    }
  } catch (err) {
    tab?.close();
    throw err;
  }
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
