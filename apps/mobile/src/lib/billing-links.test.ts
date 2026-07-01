import { describe, expect, it, vi } from 'vitest';
import { WEB_BILLING_URL, TIER_NAME, TIER_RANK } from './billing-links';

describe('billing-links', () => {
  it('points at the web app settings (not marketing)', () => {
    expect(WEB_BILLING_URL).toBe('https://chat.finby.app/settings');
  });
  it('names and ranks every tier FREE<PRO<PREMIUM<FAMILY', () => {
    expect(TIER_NAME.PREMIUM).toBe('Premium');
    expect(TIER_RANK.FREE).toBeLessThan(TIER_RANK.PRO);
    expect(TIER_RANK.PRO).toBeLessThan(TIER_RANK.PREMIUM);
    expect(TIER_RANK.PREMIUM).toBeLessThan(TIER_RANK.FAMILY);
  });
});
