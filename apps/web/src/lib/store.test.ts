import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_PREFERENCES } from '@finby/shared';

// Stub localStorage before importing the store (persist middleware reads it on init).
const storage: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => storage[k] ?? null,
  setItem: (k: string, v: string) => { storage[k] = v; },
  removeItem: (k: string) => { delete storage[k]; },
});

// apiFetch is never called in these tests; stub to avoid network.
vi.mock('./api-client', () => ({ apiFetch: vi.fn(), API_BASE: 'https://api.test/v1' }));

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
      accountNumber: 'ACC-001',
      preferences: { ...DEFAULT_PREFERENCES },
      currentStreak: 0,
      longestStreak: 0,
    },
    workspace: {
      id: 'w1',
      name: 'My Workspace',
      slug: 'my-workspace',
      tier: 'FREE',
      baseCurrency: 'USD',
      preferredCurrencies: ['USD'],
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

describe('setUser', () => {
  it('merges a patch into user, preserving other fields', () => {
    useAuth.getState().setUser({ displayName: 'X' });
    const u = useAuth.getState().user;
    expect(u?.displayName).toBe('X');
    expect(u?.id).toBe('u1');
    expect(u?.email).toBe('alice@example.com');
    expect(u?.emailVerified).toBe(true);
    expect(u?.timezone).toBe('UTC');
    expect(u?.accountNumber).toBe('ACC-001');
  });

  it('updates preferences', () => {
    useAuth
      .getState()
      .setUser({ preferences: { ...DEFAULT_PREFERENCES, dateFormat: 'SHORT' } });
    const u = useAuth.getState().user;
    expect(u?.preferences.dateFormat).toBe('SHORT');
    expect(u?.preferences.numberFormat).toBe(DEFAULT_PREFERENCES.numberFormat);
    expect(u?.preferences.currencyDisplay).toBe(
      DEFAULT_PREFERENCES.currencyDisplay,
    );
  });

  it('is a no-op when user is null', () => {
    useAuth.setState({ user: null });
    useAuth.getState().setUser({ displayName: 'X' });
    expect(useAuth.getState().user).toBeNull();
  });
});

describe('setPreferredCurrencies', () => {
  it('updates workspace.preferredCurrencies, preserving other fields', () => {
    useAuth.getState().setPreferredCurrencies(['USD', 'EUR']);
    const ws = useAuth.getState().workspace;
    expect(ws?.preferredCurrencies).toEqual(['USD', 'EUR']);
    expect(ws?.id).toBe('w1');
    expect(ws?.name).toBe('My Workspace');
    expect(ws?.slug).toBe('my-workspace');
    expect(ws?.tier).toBe('FREE');
    expect(ws?.baseCurrency).toBe('USD');
  });

  it('is a no-op when workspace is null', () => {
    useAuth.setState({ workspace: null });
    useAuth.getState().setPreferredCurrencies(['USD', 'EUR']);
    expect(useAuth.getState().workspace).toBeNull();
  });
});

describe('workspace switcher', () => {
  it('setActiveWorkspace swaps the active workspace to a known membership', () => {
    useAuth.setState({
      workspace: { id: 'ws1', name: 'Mine', slug: 's1', tier: 'FREE', baseCurrency: 'USD', preferredCurrencies: ['USD'] } as never,
      workspaces: [
        { workspaceId: 'ws1', name: 'Mine', slug: 's1', tier: 'FREE', role: 'OWNER', baseCurrency: 'USD' },
        { workspaceId: 'ws2', name: 'Fam', slug: 's2', tier: 'FAMILY', role: 'VIEWER', baseCurrency: 'USD' },
      ],
      activeWorkspaceId: 'ws1',
    } as never);

    useAuth.getState().setActiveWorkspace('ws2');

    expect(useAuth.getState().activeWorkspaceId).toBe('ws2');
    expect(useAuth.getState().workspace?.id).toBe('ws2');
    expect(useAuth.getState().workspace?.tier).toBe('FAMILY');
  });

  it('setActiveWorkspace ignores an unknown id', () => {
    useAuth.setState({ workspaces: [], activeWorkspaceId: 'ws1' } as never);
    useAuth.getState().setActiveWorkspace('nope');
    expect(useAuth.getState().activeWorkspaceId).toBe('ws1');
  });
});
