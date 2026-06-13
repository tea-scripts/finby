import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { AccountView } from '@/lib/types';
import { AccountsSection } from './accounts-section';

interface MockWorkspace {
  id: string;
  tier: 'FREE' | 'PRO' | 'PREMIUM' | 'FAMILY';
  baseCurrency: string;
  preferredCurrencies: string[];
}

interface MockState {
  workspace: MockWorkspace;
  activeWorkspaceId: string;
  workspaces: { workspaceId: string; role: 'OWNER' | 'CO_MANAGER' | 'VIEWER' }[];
}

let state: MockState;

vi.mock('../../lib/store', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useAuth: vi.fn((selector: (s: any) => unknown) => selector(state)),
}));

vi.mock('../../lib/dashboard-api', () => ({
  listAccounts: vi.fn(),
}));

vi.mock('../../lib/accounts-api', () => ({
  createAccount: vi.fn(),
  updateAccount: vi.fn(),
}));

vi.mock('../../lib/use-formatters', () => ({
  useFormatters: () => ({ formatMoney: (a: string, c: string) => `${c} ${a}` }),
}));

import { listAccounts } from '../../lib/dashboard-api';
import { createAccount, updateAccount } from '../../lib/accounts-api';

const mockList = vi.mocked(listAccounts);
const mockCreate = vi.mocked(createAccount);
const mockUpdate = vi.mocked(updateAccount);

function account(overrides: Partial<AccountView> = {}): AccountView {
  return {
    id: 'a1',
    name: 'BDO Savings',
    currency: 'USD',
    accountType: 'BANK',
    balance: '1000',
    color: null,
    icon: null,
    isArchived: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state = {
    workspace: { id: 'w1', tier: 'PRO', baseCurrency: 'USD', preferredCurrencies: ['USD', 'PHP'] },
    activeWorkspaceId: 'w1',
    workspaces: [{ workspaceId: 'w1', role: 'OWNER' }],
  };
  mockList.mockResolvedValue([]);
});

describe('AccountsSection', () => {
  it('lists existing accounts with formatted balances', async () => {
    mockList.mockResolvedValue([account()]);
    render(<AccountsSection />);
    expect(await screen.findByText('BDO Savings')).toBeInTheDocument();
    expect(screen.getByText('USD 1000')).toBeInTheDocument();
  });

  it('adds an account via the form and shows it in the list', async () => {
    mockList.mockResolvedValue([]);
    mockCreate.mockResolvedValue(account({ id: 'a2', name: 'GCash', accountType: 'EWALLET', balance: '0' }));
    render(<AccountsSection />);

    fireEvent.click(await screen.findByRole('button', { name: /add account/i }));
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'GCash' } });
    // Account type is our custom Dropdown (not a native <select>): open + pick.
    fireEvent.click(screen.getByRole('button', { name: /account type/i }));
    fireEvent.click(screen.getByRole('option', { name: 'E-wallet' }));
    fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        'w1',
        expect.objectContaining({ name: 'GCash', accountType: 'EWALLET' }),
      );
    });
    expect(await screen.findByText('GCash')).toBeInTheDocument();
  });

  it('archives an account', async () => {
    mockList.mockResolvedValue([account()]);
    mockUpdate.mockResolvedValue(account({ isArchived: true }));
    render(<AccountsSection />);
    await screen.findByText('BDO Savings');

    fireEvent.click(screen.getByRole('button', { name: /archive/i }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('w1', 'a1', { isArchived: true });
    });
  });

  it('VIEWER members see accounts read-only: no add/edit/archive controls', async () => {
    state.workspace.tier = 'FAMILY';
    state.workspaces = [{ workspaceId: 'w1', role: 'VIEWER' }];
    mockList.mockResolvedValue([account()]);

    render(<AccountsSection />);

    expect(await screen.findByText('BDO Savings')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add account/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /archive/i })).not.toBeInTheDocument();
  });

  it('CO_MANAGER members can manage accounts', async () => {
    state.workspace.tier = 'FAMILY';
    state.workspaces = [{ workspaceId: 'w1', role: 'CO_MANAGER' }];
    mockList.mockResolvedValue([account()]);

    render(<AccountsSection />);

    expect(await screen.findByText('BDO Savings')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add account/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /archive/i })).toBeInTheDocument();
  });

  it('surfaces an error when account creation fails', async () => {
    mockList.mockResolvedValue([]);
    mockCreate.mockRejectedValue(new Error('tier_limit'));
    render(<AccountsSection />);

    fireEvent.click(await screen.findByRole('button', { name: /add account/i }));
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'Wise' } });
    fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));

    expect(await screen.findByText(/couldn.?t add/i)).toBeInTheDocument();
    expect(mockCreate).toHaveBeenCalled();
  });
});
