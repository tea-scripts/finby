// apps/mobile/src/components/settings/workspace-switcher.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const setWorkspaces = jest.fn();
const setActiveWorkspace = jest.fn();
let mockState: Record<string, unknown>;
jest.mock('../../lib/use-auth-store', () => ({ useAuthStore: (s: (x: unknown) => unknown) => s(mockState) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../lib/runtime.native', () => ({ api: { members: { listWorkspaces: jest.fn() } } }));
import { WorkspaceSwitcher } from './workspace-switcher';
import { api } from '../../lib/runtime.native';
const members = api.members as unknown as { listWorkspaces: jest.Mock };

const W1 = { workspaceId: 'w1', name: 'Mine', slug: 's1', tier: 'FREE', role: 'OWNER', baseCurrency: 'USD', preferredCurrencies: ['USD'] };
const W2 = { workspaceId: 'w2', name: 'The Smiths', slug: 's2', tier: 'FAMILY', role: 'VIEWER', baseCurrency: 'USD', preferredCurrencies: ['USD'] };

beforeEach(() => {
  setWorkspaces.mockReset(); setActiveWorkspace.mockReset();
  members.listWorkspaces.mockReset().mockResolvedValue([W1, W2]);
  mockState = { workspace: { id: 'w1', name: 'Mine' }, workspaces: [W1, W2], setWorkspaces, setActiveWorkspace };
});

it('shows the active workspace name and switches on select', async () => {
  await render(<WorkspaceSwitcher />);
  expect(screen.getByText('Mine')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Switch workspace'));
  await fireEvent.press(screen.getByText('The Smiths'));
  expect(setActiveWorkspace).toHaveBeenCalledWith('w2');
});

it('is non-interactive with a single workspace', async () => {
  mockState = { workspace: { id: 'w1', name: 'Mine' }, workspaces: [W1], setWorkspaces, setActiveWorkspace };
  await render(<WorkspaceSwitcher />);
  expect(screen.getByText('Mine')).toBeTruthy();
  expect(screen.queryByLabelText('Switch workspace')).toBeNull();
});
