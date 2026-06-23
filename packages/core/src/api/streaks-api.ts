import type { StreakStatus, StreakCalendar } from '@finby/shared';
import type { AuthedFetch } from './contract';

export interface StreaksApi {
  getStreakStatus(workspaceId: string): Promise<StreakStatus>;
  repairStreak(workspaceId: string): Promise<StreakStatus>;
  getStreakCalendar(workspaceId: string): Promise<StreakCalendar>;
}

export function createStreaksApi(authed: AuthedFetch): StreaksApi {
  return {
    getStreakStatus(workspaceId) {
      return authed<StreakStatus>(`/workspaces/${workspaceId}/streaks`);
    },
    repairStreak(workspaceId) {
      return authed<StreakStatus>(`/workspaces/${workspaceId}/streaks/repair`, { method: 'POST' });
    },
    getStreakCalendar(workspaceId) {
      return authed<StreakCalendar>(`/workspaces/${workspaceId}/streaks/calendar`);
    },
  };
}
