import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('../../lib/use-auth-store', () => ({ useAuthStore: (s: (x: unknown) => unknown) => s({ workspace: { id: 'w1', baseCurrency: 'USD', preferredCurrencies: ['USD'] } }) }));
jest.mock('../../lib/use-workspace-role', () => ({ useWorkspaceRole: () => 'OWNER' }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: { children: unknown }) => children, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@finby/core', () => ({ ApiError: class extends Error {}, money: (v: string, c: string) => `${c} ${v}` }));
jest.mock('../../lib/runtime.native', () => ({ api: {
  dashboard: { listAccounts: jest.fn() },
  accounts: { createAccount: jest.fn(), updateAccount: jest.fn() },
} }));

import { AccountsScreen } from './accounts-screen';
import { api } from '../../lib/runtime.native';
const dash = api.dashboard as unknown as { listAccounts: jest.Mock };
const accounts = api.accounts as unknown as { createAccount: jest.Mock; updateAccount: jest.Mock };

const ACC = { id: 'a1', name: 'BDO', currency: 'USD', accountType: 'BANK', balance: '100.00', color: null, icon: null, isArchived: false };
beforeEach(() => {
  dash.listAccounts.mockReset().mockResolvedValue([ACC]);
  accounts.createAccount.mockReset();
  accounts.updateAccount.mockReset().mockResolvedValue({ ...ACC, isArchived: true });
});

it('lists accounts on load', async () => {
  await render(<AccountsScreen />);
  await waitFor(() => expect(screen.getByText('BDO')).toBeTruthy());
});
