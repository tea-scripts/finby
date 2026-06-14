import { useAuth } from './store';
import type { StreakStatus } from './types';

function authed<T>(path: string, init?: RequestInit): Promise<T> {
  return useAuth.getState().authed<T>(path, init);
}

export function getStreakStatus(workspaceId: string): Promise<StreakStatus> {
  return authed<StreakStatus>(`/workspaces/${workspaceId}/streaks`);
}

export function repairStreak(workspaceId: string): Promise<StreakStatus> {
  return authed<StreakStatus>(`/workspaces/${workspaceId}/streaks/repair`, { method: 'POST' });
}
