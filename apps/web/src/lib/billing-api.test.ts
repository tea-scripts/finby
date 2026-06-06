import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  cancelSubscription,
  resumeSubscription,
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
