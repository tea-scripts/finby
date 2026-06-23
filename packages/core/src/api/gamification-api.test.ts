import { describe, expect, it, vi } from 'vitest';
import { createGamificationApi } from './gamification-api';

const ok = (payload: unknown) => vi.fn(async () => payload as never);

const deps = (authed = ok({}), authedStream = vi.fn()) => ({
  authed,
  authedStream: authedStream as never,
  apiBase: 'https://api.test/v1',
});

describe('createGamificationApi', () => {
  it('getXpSummary GETs the xp path via authed', async () => {
    const authed = ok({ balance: 0, totalEarned: 0, todayEarned: 0 });
    await createGamificationApi(deps(authed)).getXpSummary('ws1');
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/gamification/xp');
  });
  it('getBadgeSvgUrl builds the absolute URL from apiBase', () => {
    const url = createGamificationApi(deps()).getBadgeSvgUrl('ws1', 'streak-7');
    expect(url).toBe('https://api.test/v1/workspaces/ws1/gamification/achievements/streak-7/badge.svg');
  });
  it('getBadgeSvg fetches via authedStream and returns the text body', async () => {
    const authedStream = vi.fn(async () => ({ text: async () => '<svg/>' }));
    const svg = await createGamificationApi(deps(ok({}), authedStream)).getBadgeSvg('ws1', 'streak-7');
    expect(svg).toBe('<svg/>');
    expect(authedStream).toHaveBeenCalledWith(
      '/workspaces/ws1/gamification/achievements/streak-7/badge.svg',
      { method: 'GET' },
    );
  });
});
