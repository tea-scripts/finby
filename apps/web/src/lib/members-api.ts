import { apiFetch } from './api-client';
import { useAuth } from './store';
import type {
  AuthResult, InvitePreview, InviteView, MemberView, WorkspaceMembershipSummary, WorkspaceMemberRole,
} from './types';

function authed<T>(path: string, init?: RequestInit): Promise<T> {
  return useAuth.getState().authed<T>(path, init);
}

export function listWorkspaces(): Promise<WorkspaceMembershipSummary[]> {
  return authed<WorkspaceMembershipSummary[]>('/auth/workspaces');
}

export function listMembers(workspaceId: string): Promise<MemberView[]> {
  return authed<MemberView[]>(`/workspaces/${workspaceId}/members`);
}

export function listInvites(workspaceId: string): Promise<InviteView[]> {
  return authed<InviteView[]>(`/workspaces/${workspaceId}/invites`);
}

export function inviteMember(workspaceId: string, email: string, role: Exclude<WorkspaceMemberRole, 'OWNER'>): Promise<InviteView> {
  return authed<InviteView>(`/workspaces/${workspaceId}/invites`, {
    method: 'POST',
    body: JSON.stringify({ email, role }),
  });
}

export function cancelInvite(workspaceId: string, inviteId: string): Promise<void> {
  return authed<void>(`/workspaces/${workspaceId}/invites/${inviteId}`, { method: 'DELETE' });
}

export function resendInvite(workspaceId: string, inviteId: string): Promise<InviteView> {
  return authed<InviteView>(`/workspaces/${workspaceId}/invites/${inviteId}/resend`, { method: 'POST' });
}

export function changeMemberRole(workspaceId: string, memberId: string, role: WorkspaceMemberRole): Promise<MemberView> {
  return authed<MemberView>(`/workspaces/${workspaceId}/members/${memberId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export function removeMember(workspaceId: string, memberId: string): Promise<void> {
  return authed<void>(`/workspaces/${workspaceId}/members/${memberId}`, { method: 'DELETE' });
}

export function leaveWorkspace(workspaceId: string): Promise<void> {
  return authed<void>(`/workspaces/${workspaceId}/members/me`, { method: 'DELETE' });
}

// Public (no auth) invite endpoints:
export function previewInvite(token: string): Promise<InvitePreview> {
  return apiFetch<InvitePreview>(`/invites/${token}`);
}

export function acceptInvite(token: string): Promise<{ workspaceId: string }> {
  return authed<{ workspaceId: string }>(`/invites/${token}/accept`, { method: 'POST' });
}

export function acceptInviteSignup(
  token: string,
  body: { displayName: string; password: string; baseCurrency?: string; timezone?: string },
): Promise<AuthResult> {
  return apiFetch<AuthResult>(`/invites/${token}/accept-signup`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
