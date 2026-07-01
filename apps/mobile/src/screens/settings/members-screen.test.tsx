import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('../../lib/use-auth-store', () => ({ useAuthStore: (s: (x: unknown) => unknown) => s({ workspace: { id: 'w1', tier: 'FAMILY' } }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: { children: unknown }) => children, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-blur', () => ({ BlurView: ({ children }: { children: unknown }) => children }));
jest.mock('@finby/core', () => ({ ApiError: class extends Error {} }));
jest.mock('../../lib/runtime.native', () => ({ api: { members: {
  listMembers: jest.fn(), listInvites: jest.fn(), inviteMember: jest.fn(),
  cancelInvite: jest.fn(), resendInvite: jest.fn(), changeMemberRole: jest.fn(), removeMember: jest.fn(), leaveWorkspace: jest.fn(),
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
};

beforeEach(() => {
  members.listMembers.mockReset().mockResolvedValue([
    { id: 'm1', userId: 'u1', displayName: 'Owner', email: 'o@e.co', role: 'OWNER', joinedAt: '', isSelf: true },
    { id: 'm2', userId: 'u2', displayName: 'Kid', email: 'k@e.co', role: 'VIEWER', joinedAt: '', isSelf: false },
  ]);
  members.listInvites.mockReset().mockResolvedValue([]);
  members.inviteMember.mockReset().mockResolvedValue({ id: 'i1', email: 'new@e.co', role: 'VIEWER', invitedByUserId: 'u1', expiresAt: '', createdAt: '' });
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
