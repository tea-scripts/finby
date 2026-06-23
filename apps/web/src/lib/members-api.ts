import { createMembersApi, type AuthedFetch } from '@finby/core';
import { apiFetch } from './api-client';
import { useAuth } from './store';

const authed: AuthedFetch = <T>(p: string, i?: RequestInit) => useAuth.getState().authed<T>(p, i);

export const {
  listWorkspaces, listMembers, listInvites, inviteMember, cancelInvite, resendInvite,
  changeMemberRole, removeMember, leaveWorkspace, previewInvite, acceptInvite, acceptInviteSignup,
} = createMembersApi({ authed, apiFetch });
