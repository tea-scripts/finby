import type { AlertListResult, AlertView } from '@finby/shared';
import type { AuthedFetch } from './contract';

export interface AlertsApi {
  listAlerts(
    workspaceId: string,
    params?: { status?: 'UNREAD' | 'READ' | 'DISMISSED'; cursor?: string; limit?: number },
  ): Promise<AlertListResult>;
  updateAlertStatus(
    workspaceId: string,
    alertId: string,
    status: 'READ' | 'DISMISSED',
  ): Promise<AlertView>;
  markAllAlertsRead(workspaceId: string): Promise<{ updated: number }>;
}

export function createAlertsApi(authed: AuthedFetch): AlertsApi {
  return {
    listAlerts(workspaceId, params) {
      const q = new URLSearchParams();
      if (params?.status) q.set('status', params.status);
      if (params?.cursor) q.set('cursor', params.cursor);
      if (params?.limit) q.set('limit', String(params.limit));
      const qs = q.toString();
      return authed<AlertListResult>(`/workspaces/${workspaceId}/alerts${qs ? `?${qs}` : ''}`);
    },
    updateAlertStatus(workspaceId, alertId, status) {
      return authed<AlertView>(`/workspaces/${workspaceId}/alerts/${alertId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    },
    markAllAlertsRead(workspaceId) {
      return authed<{ updated: number }>(`/workspaces/${workspaceId}/alerts/mark-all-read`, {
        method: 'PATCH',
      });
    },
  };
}
