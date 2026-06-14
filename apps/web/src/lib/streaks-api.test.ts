import { describe, it, expect, vi, beforeEach } from 'vitest';

const authed = vi.fn();
vi.mock('./store', () => ({
  useAuth: { getState: () => ({ authed }) },
}));

import { getStreakStatus, repairStreak } from './streaks-api';

beforeEach(() => {
  vi.clearAllMocks();
  authed.mockResolvedValue({});
});

describe('streaks-api', () => {
  it('getStreakStatus GETs the workspace streak path', async () => {
    await getStreakStatus('w1');
    expect(authed).toHaveBeenCalledWith('/workspaces/w1/streaks', undefined);
  });

  it('repairStreak POSTs to the repair path', async () => {
    await repairStreak('w1');
    expect(authed).toHaveBeenCalledWith('/workspaces/w1/streaks/repair', { method: 'POST' });
  });
});
