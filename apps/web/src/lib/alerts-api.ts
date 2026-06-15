import { useAuth } from '@/lib/store';
import type { AlertListResult, AlertView } from '@/lib/types';

function authed<T>(path: string, init?: RequestInit): Promise<T> {
  return useAuth.getState().authed<T>(path, init);
}

export function listAlerts(
  workspaceId: string,
  params?: { status?: 'UNREAD' | 'READ' | 'DISMISSED'; cursor?: string; limit?: number },
): Promise<AlertListResult> {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.cursor) q.set('cursor', params.cursor);
  if (params?.limit) q.set('limit', String(params.limit));
  const qs = q.toString();
  return authed<AlertListResult>(`/workspaces/${workspaceId}/alerts${qs ? `?${qs}` : ''}`);
}

export function updateAlertStatus(
  workspaceId: string,
  alertId: string,
  status: 'READ' | 'DISMISSED',
): Promise<AlertView> {
  return authed<AlertView>(`/workspaces/${workspaceId}/alerts/${alertId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function markAllAlertsRead(workspaceId: string): Promise<{ updated: number }> {
  return authed<{ updated: number }>(`/workspaces/${workspaceId}/alerts/mark-all-read`, {
    method: 'PATCH',
  });
}
