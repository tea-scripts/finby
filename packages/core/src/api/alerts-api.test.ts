import { describe, expect, it, vi } from 'vitest';
import { createAlertsApi } from './alerts-api';

const ok = (payload: unknown) => vi.fn(async () => payload as never);

describe('createAlertsApi', () => {
  it('listAlerts omits the query string when no params', async () => {
    const authed = ok({ alerts: [], unreadCount: 0, nextCursor: null, hasMore: false });
    await createAlertsApi(authed).listAlerts('ws1');
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/alerts');
  });
  it('listAlerts appends status/limit when provided', async () => {
    const authed = ok({ alerts: [], unreadCount: 0, nextCursor: null, hasMore: false });
    await createAlertsApi(authed).listAlerts('ws1', { status: 'UNREAD', limit: 5 });
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/alerts?status=UNREAD&limit=5');
  });
  it('updateAlertStatus PATCHes the alert with the new status', async () => {
    const authed = ok({ id: 'al1' });
    await createAlertsApi(authed).updateAlertStatus('ws1', 'al1', 'READ');
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/alerts/al1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'READ' }),
    });
  });
});
