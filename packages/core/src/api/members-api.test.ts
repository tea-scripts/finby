import { describe, expect, it, vi } from 'vitest';
import { createMembersApi } from './members-api';

const ok = (payload: unknown) => vi.fn(async () => payload as never);

describe('createMembersApi', () => {
  it('inviteMember POSTs email + role via authed', async () => {
    const authed = ok({ id: 'i1' });
    const apiFetch = ok({});
    await createMembersApi({ authed, apiFetch }).inviteMember('ws1', 'a@b.com', 'VIEWER');
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/invites', {
      method: 'POST',
      body: JSON.stringify({ email: 'a@b.com', role: 'VIEWER' }),
    });
  });
  it('previewInvite uses the UNAUTHENTICATED apiFetch', async () => {
    const authed = ok({});
    const apiFetch = ok({ workspaceName: 'W' });
    await createMembersApi({ authed, apiFetch }).previewInvite('tok123');
    expect(apiFetch).toHaveBeenCalledWith('/invites/tok123');
    expect(authed).not.toHaveBeenCalled();
  });
});
