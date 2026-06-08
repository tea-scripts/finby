// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./store', () => ({
  useAuth: {
    getState: vi.fn(),
  },
}));

vi.mock('./api-client', () => ({
  apiFetch: vi.fn(),
}));

import { useAuth } from './store';
import { apiFetch } from './api-client';
import {
  getSubscription,
  getPlans,
  startCheckout,
  openPortal,
  openBillingUrl,
  cancelSubscription,
  resumeSubscription,
  changePlan,
} from './billing-api';

const mockAuthed = vi.fn();

beforeEach(() => {
  vi.mocked(useAuth.getState).mockReturnValue({ authed: mockAuthed } as unknown as ReturnType<typeof useAuth.getState>);
  mockAuthed.mockReset();
  vi.mocked(apiFetch).mockReset();
});

describe('getSubscription', () => {
  it('calls authed GET /workspaces/:id/subscription', () => {
    mockAuthed.mockResolvedValue({ tier: 'FREE', status: 'ACTIVE' });
    getSubscription('w1');
    expect(mockAuthed).toHaveBeenCalledWith('/workspaces/w1/subscription', undefined);
  });
});

describe('getPlans', () => {
  it('calls apiFetch GET /billing/plans (no auth)', () => {
    vi.mocked(apiFetch).mockResolvedValue({ plans: [] });
    getPlans();
    expect(apiFetch).toHaveBeenCalledWith('/billing/plans');
    expect(mockAuthed).not.toHaveBeenCalled();
  });
});

describe('startCheckout', () => {
  it('calls authed POST /workspaces/:id/subscription/checkout with tier body', () => {
    mockAuthed.mockResolvedValue({ url: 'https://checkout.stripe.com/test' });
    startCheckout('w1', 'PRO');
    expect(mockAuthed).toHaveBeenCalledWith('/workspaces/w1/subscription/checkout', {
      method: 'POST',
      body: JSON.stringify({ tier: 'PRO' }),
    });
  });

  it('accepts PREMIUM tier', () => {
    mockAuthed.mockResolvedValue({ url: 'https://checkout.stripe.com/test' });
    startCheckout('w1', 'PREMIUM');
    expect(mockAuthed).toHaveBeenCalledWith('/workspaces/w1/subscription/checkout', {
      method: 'POST',
      body: JSON.stringify({ tier: 'PREMIUM' }),
    });
  });
});

describe('openPortal', () => {
  it('calls authed POST /workspaces/:id/subscription/portal', () => {
    mockAuthed.mockResolvedValue({ url: 'https://billing.stripe.com/portal' });
    openPortal('w1');
    expect(mockAuthed).toHaveBeenCalledWith('/workspaces/w1/subscription/portal', {
      method: 'POST',
    });
  });
});

describe('changePlan', () => {
  it('calls authed POST /workspaces/:id/subscription/change-plan with tier body', () => {
    mockAuthed.mockResolvedValue({ tier: 'PREMIUM' });
    changePlan('w1', 'PREMIUM');
    expect(mockAuthed).toHaveBeenCalledWith('/workspaces/w1/subscription/change-plan', {
      method: 'POST',
      body: JSON.stringify({ tier: 'PREMIUM' }),
    });
  });
});

describe('openBillingUrl', () => {
  const realOpen = window.open;
  const realLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, 'location', { value: { href: '' }, writable: true });
  });

  afterEach(() => {
    window.open = realOpen;
    Object.defineProperty(window, 'location', { value: realLocation, writable: true });
  });

  it('opens a blank tab synchronously and redirects it to the resolved url', async () => {
    const tab = { location: { href: '' }, opener: {}, close: vi.fn() } as unknown as Window;
    window.open = vi.fn().mockReturnValue(tab);

    await openBillingUrl(async () => 'https://billing.stripe.com/x');

    expect(window.open).toHaveBeenCalledWith('', '_blank');
    expect((tab as unknown as { location: { href: string } }).location.href).toBe(
      'https://billing.stripe.com/x',
    );
    // never touches the app's own context — that's the PWA bug being avoided
    expect(window.location.href).toBe('');
  });

  it('falls back to a same-tab redirect when the popup is blocked', async () => {
    window.open = vi.fn().mockReturnValue(null);

    await openBillingUrl(async () => 'https://billing.stripe.com/y');

    expect(window.location.href).toBe('https://billing.stripe.com/y');
  });

  it('closes the opened tab and rethrows when resolving the url fails', async () => {
    const tab = { location: { href: '' }, opener: {}, close: vi.fn() } as unknown as Window;
    window.open = vi.fn().mockReturnValue(tab);

    await expect(
      openBillingUrl(async () => {
        throw new Error('portal failed');
      }),
    ).rejects.toThrow('portal failed');
    expect((tab as unknown as { close: () => void }).close).toHaveBeenCalled();
  });
});

describe('cancelSubscription', () => {
  it('calls authed POST /workspaces/:id/subscription/cancel', () => {
    mockAuthed.mockResolvedValue({ tier: 'PRO', status: 'CANCELED' });
    cancelSubscription('w1');
    expect(mockAuthed).toHaveBeenCalledWith('/workspaces/w1/subscription/cancel', {
      method: 'POST',
    });
  });
});

describe('resumeSubscription', () => {
  it('calls authed POST /workspaces/:id/subscription/resume', () => {
    mockAuthed.mockResolvedValue({ tier: 'PRO', status: 'ACTIVE' });
    resumeSubscription('w1');
    expect(mockAuthed).toHaveBeenCalledWith('/workspaces/w1/subscription/resume', {
      method: 'POST',
    });
  });
});
