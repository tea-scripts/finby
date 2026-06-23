import { describe, expect, it, vi } from 'vitest';
import { createMobileApi } from './api';
import type { MobileSession } from './session';

function fakeSession(): MobileSession {
  return {
    authed: vi.fn(async () => ({ conversations: [] }) as never),
    authedStream: vi.fn(async () => new Response('')),
    tryRefresh: vi.fn(async () => false),
    setSession: vi.fn(async () => {}),
    clearSession: vi.fn(async () => {}),
    hydrate: vi.fn(async () => false),
    getAccessToken: () => 'a1',
    login: vi.fn(async () => ({ accessToken: 'a1', refreshToken: 'r1', user: { id: 'u1' } as never, workspace: { id: 'w1' } as never })),
    register: vi.fn(async () => ({ accessToken: 'a1', refreshToken: 'r1', user: { id: 'u1' } as never, workspace: { id: 'w1' } as never })),
    logout: vi.fn(async () => {}),
  };
}

describe('createMobileApi', () => {
  it('exposes every core API namespace', () => {
    const api = createMobileApi(fakeSession(), 'https://api.test/v1');
    for (const ns of [
      'dashboard', 'transactions', 'accounts', 'streaks', 'alerts', 'settings',
      'support', 'feedback', 'members', 'auth', 'billing', 'receipts', 'gamification', 'chat',
    ]) {
      expect(api).toHaveProperty(ns);
    }
  });

  it('routes a dashboard call through session.authed', async () => {
    const session = fakeSession();
    const api = createMobileApi(session, 'https://api.test/v1');
    await api.dashboard.listBudgets('ws1');
    expect(session.authed).toHaveBeenCalledWith('/workspaces/ws1/budgets');
  });

  it('builds gamification badge URLs from the apiBase', () => {
    const api = createMobileApi(fakeSession(), 'https://api.test/v1');
    expect(api.gamification.getBadgeSvgUrl('ws1', 'streak-7'))
      .toBe('https://api.test/v1/workspaces/ws1/gamification/achievements/streak-7/badge.svg');
  });
});
