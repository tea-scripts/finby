import type {
  AuthResult, InvitePreview, InviteView, MemberView, WorkspaceMembershipSummary, WorkspaceMemberRole,
} from '@finby/shared';
import type { ApiFetch, AuthedFetch } from './contract';

export interface MembersApi {
  listWorkspaces(): Promise<WorkspaceMembershipSummary[]>;
  listMembers(workspaceId: string): Promise<MemberView[]>;
  listInvites(workspaceId: string): Promise<InviteView[]>;
  inviteMember(workspaceId: string, email: string, role: Exclude<WorkspaceMemberRole, 'OWNER'>): Promise<InviteView>;
  cancelInvite(workspaceId: string, inviteId: string): Promise<void>;
  resendInvite(workspaceId: string, inviteId: string): Promise<InviteView>;
  changeMemberRole(workspaceId: string, memberId: string, role: WorkspaceMemberRole): Promise<MemberView>;
  removeMember(workspaceId: string, memberId: string): Promise<void>;
  leaveWorkspace(workspaceId: string): Promise<void>;
  previewInvite(token: string): Promise<InvitePreview>;
  acceptInvite(token: string): Promise<{ workspaceId: string }>;
  acceptInviteSignup(
    token: string,
    body: {
      displayName: string;
      password: string;
      baseCurrency?: string;
      timezone?: string;
      acceptedTermsVersion: string;
    },
  ): Promise<AuthResult>;
}

export function createMembersApi(deps: { authed: AuthedFetch; apiFetch: ApiFetch }): MembersApi {
  const { authed, apiFetch } = deps;
  return {
    listWorkspaces() {
      return authed<WorkspaceMembershipSummary[]>('/auth/workspaces');
    },
    listMembers(workspaceId) {
      return authed<MemberView[]>(`/workspaces/${workspaceId}/members`);
    },
    listInvites(workspaceId) {
      return authed<InviteView[]>(`/workspaces/${workspaceId}/invites`);
    },
    inviteMember(workspaceId, email, role) {
      return authed<InviteView>(`/workspaces/${workspaceId}/invites`, {
        method: 'POST',
        body: JSON.stringify({ email, role }),
      });
    },
    cancelInvite(workspaceId, inviteId) {
      return authed<void>(`/workspaces/${workspaceId}/invites/${inviteId}`, { method: 'DELETE' });
    },
    resendInvite(workspaceId, inviteId) {
      return authed<InviteView>(`/workspaces/${workspaceId}/invites/${inviteId}/resend`, { method: 'POST' });
    },
    changeMemberRole(workspaceId, memberId, role) {
      return authed<MemberView>(`/workspaces/${workspaceId}/members/${memberId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
    },
    removeMember(workspaceId, memberId) {
      return authed<void>(`/workspaces/${workspaceId}/members/${memberId}`, { method: 'DELETE' });
    },
    leaveWorkspace(workspaceId) {
      return authed<void>(`/workspaces/${workspaceId}/members/me`, { method: 'DELETE' });
    },
    previewInvite(token) {
      return apiFetch<InvitePreview>(`/invites/${token}`);
    },
    acceptInvite(token) {
      return authed<{ workspaceId: string }>(`/invites/${token}/accept`, { method: 'POST' });
    },
    acceptInviteSignup(token, body) {
      return apiFetch<AuthResult>(`/invites/${token}/accept-signup`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
  };
}
