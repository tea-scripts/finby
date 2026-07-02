import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockAuthState = {
  workspace: { id: 'w1', tier: 'FAMILY' },
  setWorkspaces: jest.fn(),
  setActiveWorkspace: jest.fn(),
  logout: jest.fn(),
};
jest.mock('../../lib/use-auth-store', () => ({ useAuthStore: (s: (x: unknown) => unknown) => s(mockAuthState) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: { children: unknown }) => children, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-blur', () => ({ BlurView: ({ children }: { children: unknown }) => children }));
jest.mock('@finby/core', () => ({ ApiError: class extends Error {} }));
jest.mock('../../lib/runtime.native', () => ({ api: { members: {
  listMembers: jest.fn(), listInvites: jest.fn(), inviteMember: jest.fn(),
  cancelInvite: jest.fn(), resendInvite: jest.fn(), changeMemberRole: jest.fn(), removeMember: jest.fn(), leaveWorkspace: jest.fn(),
  listWorkspaces: jest.fn(),
} } }));

import { MembersScreen } from './members-screen';
import { api } from '../../lib/runtime.native';
const members = api.members as unknown as {
  listMembers: jest.Mock;
  listInvites: jest.Mock;
  inviteMember: jest.Mock;
  cancelInvite: jest.Mock;
  resendInvite: jest.Mock;
  changeMemberRole: jest.Mock;
  removeMember: jest.Mock;
  leaveWorkspace: jest.Mock;
  listWorkspaces: jest.Mock;
};

beforeEach(() => {
  members.listMembers.mockReset().mockResolvedValue([
    { id: 'm1', userId: 'u1', displayName: 'Owner', email: 'o@e.co', role: 'OWNER', joinedAt: '', isSelf: true },
    { id: 'm2', userId: 'u2', displayName: 'Kid', email: 'k@e.co', role: 'VIEWER', joinedAt: '', isSelf: false },
  ]);
  members.listInvites.mockReset().mockResolvedValue([]);
  members.inviteMember.mockReset().mockResolvedValue({ id: 'i1', email: 'new@e.co', role: 'VIEWER', invitedByUserId: 'u1', expiresAt: '', createdAt: '' });
  members.leaveWorkspace.mockReset();
  members.listWorkspaces.mockReset();
  mockAuthState.setWorkspaces.mockReset();
  mockAuthState.setActiveWorkspace.mockReset();
  mockAuthState.logout.mockReset();
});

it('lists members and sends an invite as owner', async () => {
  await render(<MembersScreen />);
  await waitFor(() => expect(screen.getByText('Kid')).toBeTruthy());
  await fireEvent.changeText(screen.getByLabelText('Invite email'), 'new@e.co');
  await fireEvent.press(screen.getByText('Send invite'));
  await waitFor(() => expect(members.inviteMember).toHaveBeenCalledWith('w1', 'new@e.co', 'VIEWER'));
});

it('cancels a pending invite only after the server call succeeds', async () => {
  members.listInvites.mockReset().mockResolvedValue([
    { id: 'i1', email: 'pending@e.co', role: 'VIEWER', invitedByUserId: 'm1', expiresAt: '', createdAt: '' },
  ]);
  members.cancelInvite.mockReset().mockResolvedValue(undefined);

  await render(<MembersScreen />);
  await waitFor(() => expect(screen.getByText('pending@e.co')).toBeTruthy());

  await fireEvent.press(screen.getByText('Cancel'));

  await waitFor(() => expect(members.cancelInvite).toHaveBeenCalledWith('w1', 'i1'));
  await waitFor(() => expect(screen.queryByText('pending@e.co')).toBeNull());
});

it('switches to a remaining workspace after leaving', async () => {
  members.listMembers.mockResolvedValue([
    { id: 'm1', userId: 'u1', displayName: 'Kid', email: 'k@e.co', role: 'VIEWER', joinedAt: '', isSelf: true },
  ]);
  members.leaveWorkspace.mockResolvedValue(undefined);
  members.listWorkspaces.mockResolvedValue([
    { workspaceId: 'w9', name: 'Mine', slug: 's9', tier: 'FREE', role: 'OWNER', baseCurrency: 'USD', preferredCurrencies: ['USD'] },
  ]);
  await render(<MembersScreen />);
  await waitFor(() => expect(screen.getByText(/Leave/)).toBeTruthy());
  await fireEvent.press(screen.getByText('Leave this family'));         // opens ConfirmSheet
  await fireEvent.press(screen.getByText('Leave'));                     // confirm
  await waitFor(() => expect(members.leaveWorkspace).toHaveBeenCalledWith('w1'));
  await waitFor(() => expect(mockAuthState.setActiveWorkspace).toHaveBeenCalledWith('w9'));
  expect(mockAuthState.logout).not.toHaveBeenCalled();
});

it('logs out when no workspace remains after leaving', async () => {
  members.listMembers.mockResolvedValue([
    { id: 'm1', userId: 'u1', displayName: 'Kid', email: 'k@e.co', role: 'VIEWER', joinedAt: '', isSelf: true },
  ]);
  members.leaveWorkspace.mockResolvedValue(undefined);
  members.listWorkspaces.mockResolvedValue([]);
  await render(<MembersScreen />);
  await fireEvent.press(screen.getByText('Leave this family'));
  await fireEvent.press(screen.getByText('Leave'));
  await waitFor(() => expect(mockAuthState.logout).toHaveBeenCalled());
});
