import { createBillingApi, type AuthedFetch } from '@finby/core';
import { apiFetch } from './api-client';
import { useAuth } from './store';

const authed: AuthedFetch = <T>(p: string, i?: RequestInit) => useAuth.getState().authed<T>(p, i);

export const {
  getSubscription, getPlans, startCheckout, openPortal, changePlan, cancelSubscription, resumeSubscription,
} = createBillingApi({ authed, apiFetch });

/**
 * Open a Stripe billing URL (resolved asynchronously) in a separate browser tab.
 * Web-only (uses window) — stays in the web app rather than @finby/core.
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
