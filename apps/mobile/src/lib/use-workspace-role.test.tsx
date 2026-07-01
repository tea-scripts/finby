import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

jest.mock('./use-auth-store', () => ({ useAuthStore: (s: (x: unknown) => unknown) => s({ workspace: { id: 'w1' } }) }));
jest.mock('./runtime.native', () => ({ api: { members: { listWorkspaces: jest.fn().mockResolvedValue([{ workspaceId: 'w1', role: 'OWNER' }]) } } }));

import { useWorkspaceRole } from './use-workspace-role';

function Probe() {
  return <Text>{useWorkspaceRole()}</Text>;
}

it('resolves the active workspace role', async () => {
  await render(<Probe />);
  await waitFor(() => expect(screen.getByText('OWNER')).toBeTruthy());
});
