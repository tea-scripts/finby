import { describe, expect, it, vi } from 'vitest';
import { createStreaksApi } from './streaks-api';

const ok = (payload: unknown) => vi.fn(async () => payload as never);

describe('createStreaksApi', () => {
  it('getStreakStatus GETs the streaks path', async () => {
    const authed = ok({ currentStreak: 1 });
    await createStreaksApi(authed).getStreakStatus('ws1');
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/streaks');
  });
  it('repairStreak POSTs to streaks/repair', async () => {
    const authed = ok({ currentStreak: 1 });
    await createStreaksApi(authed).repairStreak('ws1');
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/streaks/repair', { method: 'POST' });
  });
});
