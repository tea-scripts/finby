import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub localStorage before importing the store (persist middleware reads it on init).
const storage: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => storage[k] ?? null,
  setItem: (k: string, v: string) => { storage[k] = v; },
  removeItem: (k: string) => { delete storage[k]; },
});

// apiFetch is never called in these tests; stub to avoid network.
vi.mock('./api-client', () => ({ apiFetch: vi.fn() }));

import { useAuth } from './store';

beforeEach(() => {
  // Reset to a clean authed workspace before each test.
  useAuth.setState({
    accessToken: 'tok',
    refreshToken: 'ref',
    user: {
      id: 'u1',
      displayName: 'Alice',
      email: 'alice@example.com',
      emailVerified: true,
      timezone: 'UTC',
    },
    workspace: {
      id: 'w1',
      name: 'My Workspace',
      slug: 'my-workspace',
      tier: 'FREE',
      baseCurrency: 'USD',
    },
    status: 'authed',
  });
});

describe('setWorkspaceTier', () => {
  it('updates workspace.tier in state', () => {
    useAuth.getState().setWorkspaceTier('PRO');
    expect(useAuth.getState().workspace?.tier).toBe('PRO');
  });

  it('preserves all other workspace fields when updating tier', () => {
    useAuth.getState().setWorkspaceTier('PREMIUM');
    const ws = useAuth.getState().workspace;
    expect(ws?.id).toBe('w1');
    expect(ws?.name).toBe('My Workspace');
    expect(ws?.slug).toBe('my-workspace');
    expect(ws?.baseCurrency).toBe('USD');
    expect(ws?.tier).toBe('PREMIUM');
  });

  it('is a no-op when workspace is null', () => {
    useAuth.setState({ workspace: null });
    // Should not throw.
    useAuth.getState().setWorkspaceTier('FAMILY');
    expect(useAuth.getState().workspace).toBeNull();
  });

  it('accepts all valid tiers', () => {
    for (const tier of ['FREE', 'PRO', 'PREMIUM', 'FAMILY'] as const) {
      useAuth.getState().setWorkspaceTier(tier);
      expect(useAuth.getState().workspace?.tier).toBe(tier);
    }
  });
});
