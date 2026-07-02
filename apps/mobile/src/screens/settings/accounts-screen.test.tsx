import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('../../lib/use-auth-store', () => ({ useAuthStore: (s: (x: unknown) => unknown) => s({ workspace: { id: 'w1', baseCurrency: 'USD', preferredCurrencies: ['USD'] } }) }));
jest.mock('../../lib/use-workspace-role', () => ({ useWorkspaceRole: jest.fn(() => 'OWNER') }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: { children: unknown }) => children, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-blur', () => ({ BlurView: ({ children }: { children: unknown }) => children }));
jest.mock('@finby/core', () => ({ ApiError: class extends Error {}, money: (v: string, c: string) => `${c} ${v}` }));
jest.mock('../../lib/runtime.native', () => ({ api: {
  dashboard: { listAccounts: jest.fn() },
  accounts: { createAccount: jest.fn(), updateAccount: jest.fn() },
} }));

import { AccountsScreen } from './accounts-screen';
import { api } from '../../lib/runtime.native';
import { useWorkspaceRole } from '../../lib/use-workspace-role';
const dash = api.dashboard as unknown as { listAccounts: jest.Mock };
const accounts = api.accounts as unknown as { createAccount: jest.Mock; updateAccount: jest.Mock };
const role = useWorkspaceRole as jest.Mock;

const ACC = { id: 'a1', name: 'BDO', currency: 'USD', accountType: 'BANK', balance: '100.00', color: null, icon: null, isArchived: false };
beforeEach(() => {
  role.mockReset().mockReturnValue('OWNER');
  dash.listAccounts.mockReset().mockResolvedValue([ACC]);
  accounts.createAccount.mockReset();
  accounts.updateAccount.mockReset().mockResolvedValue({ ...ACC, isArchived: true });
});

it('lists accounts on load', async () => {
  await render(<AccountsScreen />);
  await waitFor(() => expect(screen.getByText('BDO')).toBeTruthy());
});

it('adds a new account', async () => {
  const created = { id: 'a2', name: 'Test Account', currency: 'USD', accountType: 'BANK', balance: '0.00', color: null, icon: null, isArchived: false };
  accounts.createAccount.mockResolvedValue(created);

  await render(<AccountsScreen />);
  await waitFor(() => expect(screen.getByText('BDO')).toBeTruthy());

  await fireEvent.press(screen.getByText('Add account'));
  await fireEvent.changeText(screen.getByLabelText('Account name'), 'Test Account');
  await fireEvent.press(screen.getByText('Add'));

  await waitFor(() => expect(accounts.createAccount).toHaveBeenCalledWith('w1', {
    name: 'Test Account', accountType: 'BANK', currency: 'USD', initialBalance: '0',
  }));
  await waitFor(() => expect(screen.getByText('Test Account')).toBeTruthy());
});

it('archives an account after confirming', async () => {
  await render(<AccountsScreen />);
  await waitFor(() => expect(screen.getByText('BDO')).toBeTruthy());

  await fireEvent.press(screen.getByText('Archive'));
  await waitFor(() => expect(screen.getAllByText('Archive').length).toBeGreaterThan(1));

  const archiveButtons = screen.getAllByText('Archive');
  await fireEvent.press(archiveButtons[archiveButtons.length - 1]!);

  await waitFor(() => expect(accounts.updateAccount).toHaveBeenCalledWith('w1', 'a1', { isArchived: true }));
});

it('edits an account name via the shared sheet', async () => {
  accounts.updateAccount.mockResolvedValue({ ...ACC, name: 'BDO 2' });
  await render(<AccountsScreen />);
  await waitFor(() => expect(screen.getByText('BDO')).toBeTruthy());
  await fireEvent.press(screen.getByLabelText('Edit BDO'));
  await fireEvent.changeText(screen.getByLabelText('Account name'), 'BDO 2');
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() =>
    expect(accounts.updateAccount).toHaveBeenCalledWith('w1', 'a1', { name: 'BDO 2', color: null }),
  );
  await waitFor(() => expect(screen.getByText('BDO 2')).toBeTruthy());
});

it('hides account management for viewers', async () => {
  role.mockReturnValue('VIEWER');

  await render(<AccountsScreen />);
  await waitFor(() => expect(screen.getByText('BDO')).toBeTruthy());

  expect(screen.queryByText('Add account')).toBeNull();
  expect(screen.getByText('Only owners and co-managers can add or edit accounts.')).toBeTruthy();
});
