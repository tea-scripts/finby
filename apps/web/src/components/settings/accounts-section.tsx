'use client';

import { useEffect, useMemo, useState } from 'react';
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, type AccountType } from '@finby/shared';
import { Button } from '@/components/ui/button';
import { ColorPicker } from '@/components/ui/color-picker';
import { Dropdown } from '@/components/ui/dropdown';
import { Input } from '@/components/ui/input';
import { listAccounts } from '@/lib/dashboard-api';
import { createAccount, updateAccount } from '@/lib/accounts-api';
import { toast } from '@/lib/toast';
import { useAuth } from '@/lib/store';
import { useFormatters } from '@/lib/use-formatters';
import type { AccountView } from '@/lib/types';

/** Manage workspace accounts: list, add, rename, archive. Balances are read-only
 *  here (maintained by the transaction ledger); opening balance is set at creation. */
export function AccountsSection() {
  const workspace = useAuth((s) => s.workspace);
  const workspaces = useAuth((s) => s.workspaces);
  const activeWorkspaceId = useAuth((s) => s.activeWorkspaceId);
  const { formatMoney } = useFormatters();

  // Mirror MembersSection: derive the current member's role from the membership
  // summaries. Only OWNER/CO_MANAGER may mutate (the backend enforces this too).
  // Role is undefined until `workspaces` loads — treat unknown as allowed so a
  // solo owner never has controls hidden during that window; a confirmed VIEWER
  // gets a read-only view.
  const role = workspaces.find((w) => w.workspaceId === activeWorkspaceId)?.role;
  const canManage = role !== 'VIEWER';

  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const workspaceId = workspace?.id;

  useEffect(() => {
    if (!workspaceId) return;
    let active = true;
    setLoading(true);
    setLoadError(false);
    listAccounts(workspaceId)
      .then((rows) => {
        if (active) setAccounts(rows);
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workspaceId]);

  // Currency options the workspace is allowed to use (base is always included).
  const currencyOptions = useMemo(() => {
    const base = workspace?.baseCurrency ?? 'USD';
    return Array.from(new Set([base, ...(workspace?.preferredCurrencies ?? [])]));
  }, [workspace?.baseCurrency, workspace?.preferredCurrencies]);

  const active = accounts.filter((a) => !a.isArchived);
  const archived = accounts.filter((a) => a.isArchived);

  function upsert(updated: AccountView): void {
    setAccounts((prev) => {
      const idx = prev.findIndex((a) => a.id === updated.id);
      if (idx === -1) return [...prev, updated];
      const next = [...prev];
      next[idx] = updated;
      return next;
    });
  }

  return (
    <section className="space-y-3">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
        Accounts
      </h2>

      <div className="space-y-4 rounded-2xl border border-line bg-surface/60 p-5 shadow-card">
        {loading ? (
          <p className="text-xs text-muted">Loading accounts…</p>
        ) : loadError ? (
          <p className="text-xs text-danger">Couldn&apos;t load accounts.</p>
        ) : (
          <>
            {active.length === 0 && archived.length === 0 ? (
              <p className="text-xs text-muted">No accounts yet. Add your first one below.</p>
            ) : (
              <ul className="divide-y divide-line">
                {active.map((a) => (
                  <AccountRow
                    key={a.id}
                    account={a}
                    formatMoney={formatMoney}
                    onUpdated={upsert}
                    workspaceId={workspaceId ?? ''}
                    canManage={canManage}
                  />
                ))}
                {archived.map((a) => (
                  <AccountRow
                    key={a.id}
                    account={a}
                    formatMoney={formatMoney}
                    onUpdated={upsert}
                    workspaceId={workspaceId ?? ''}
                    canManage={canManage}
                  />
                ))}
              </ul>
            )}

            {canManage ? (
              <AddAccountForm
                workspaceId={workspaceId ?? ''}
                currencyOptions={currencyOptions}
                onCreated={(a) => upsert(a)}
              />
            ) : (
              <p className="text-xs text-muted">
                Only owners and co-managers can add or edit accounts.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function AccountRow({
  account,
  formatMoney,
  onUpdated,
  workspaceId,
  canManage,
}: {
  account: AccountView;
  formatMoney: (amount: string, currency: string) => string;
  onUpdated: (a: AccountView) => void;
  workspaceId: string;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(account.name);
  const [color, setColor] = useState<string | null>(account.color);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function save(patch: { name?: string; isArchived?: boolean; color?: string | null }): Promise<void> {
    setBusy(true);
    setError(false);
    try {
      const updated = await updateAccount(workspaceId, account.id, patch);
      onUpdated(updated);
      setEditing(false);
      toast.success(
        patch.isArchived === undefined
          ? 'Account updated'
          : patch.isArchived
            ? 'Account archived'
            : 'Account unarchived',
      );
    } catch {
      setError(true);
      toast.error("Couldn't update account", 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`flex items-center justify-between gap-3 py-2.5 ${account.isArchived ? 'opacity-60' : ''}`}>
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="space-y-2">
            <Input
              aria-label="Edit name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <ColorPicker value={color} onChange={setColor} label="Account color" />
          </div>
        ) : (
          <p className="truncate text-sm text-ink">
            {account.color ? (
              <span
                aria-hidden
                className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle"
                style={{ backgroundColor: account.color }}
              />
            ) : null}
            {account.name}
            {account.isArchived ? <span className="ml-2 text-xs text-faint">(archived)</span> : null}
          </p>
        )}
        <p className="text-xs text-faint">
          {ACCOUNT_TYPE_LABELS[account.accountType as AccountType] ?? account.accountType}
        </p>
      </div>

      <span className="shrink-0 font-mono text-sm text-ink">
        {formatMoney(account.balance, account.currency)}
      </span>

      <div className="flex shrink-0 items-center gap-1.5">
        {!canManage ? null : editing ? (
          <>
            <Button
              variant="ghost"
              className="px-2 py-1 text-xs"
              loading={busy}
              disabled={!name.trim()}
              onClick={() => save({ name: name.trim(), color })}
            >
              Save
            </Button>
            <Button
              variant="ghost"
              className="px-2 py-1 text-xs"
              onClick={() => {
                setName(account.name);
                setColor(account.color);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              variant="ghost"
              className="px-2 py-1 text-xs"
              loading={busy}
              onClick={() => save({ isArchived: !account.isArchived })}
            >
              {account.isArchived ? 'Unarchive' : 'Archive'}
            </Button>
          </>
        )}
      </div>
      {error ? <span className="sr-only">Update failed</span> : null}
    </li>
  );
}

function AddAccountForm({
  workspaceId,
  currencyOptions,
  onCreated,
}: {
  workspaceId: string;
  currencyOptions: string[];
  onCreated: (a: AccountView) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState<AccountType>(ACCOUNT_TYPES[0]);
  const [currency, setCurrency] = useState(currencyOptions[0] ?? 'USD');
  const [openingBalance, setOpeningBalance] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  function reset(): void {
    setName('');
    setAccountType(ACCOUNT_TYPES[0]);
    setCurrency(currencyOptions[0] ?? 'USD');
    setOpeningBalance('');
    setColor(null);
    setError(false);
  }

  async function submit(): Promise<void> {
    setBusy(true);
    setError(false);
    try {
      const created = await createAccount(workspaceId, {
        name: name.trim(),
        accountType,
        currency,
        initialBalance: openingBalance.trim() || '0',
        color: color ?? undefined,
      });
      onCreated(created);
      reset();
      setOpen(false);
      toast.success('Account added');
    } catch {
      setError(true);
      toast.error("Couldn't add account", 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Add account
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs text-muted">Name</span>
          <Input
            aria-label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. BDO Savings"
          />
        </label>

        <div className="space-y-1">
          <span className="text-xs text-muted">Account type</span>
          <Dropdown
            aria-label="Account type"
            value={accountType}
            onChange={(v) => setAccountType(v as AccountType)}
            options={ACCOUNT_TYPES.map((t) => ({ value: t, label: ACCOUNT_TYPE_LABELS[t] }))}
          />
        </div>

        <div className="space-y-1">
          <span className="text-xs text-muted">Currency</span>
          <Dropdown
            aria-label="Currency"
            value={currency}
            onChange={setCurrency}
            options={currencyOptions.map((c) => ({ value: c, label: c }))}
          />
        </div>

        <label className="space-y-1">
          <span className="text-xs text-muted">Opening balance (optional)</span>
          <Input
            aria-label="Opening balance"
            inputMode="decimal"
            value={openingBalance}
            onChange={(e) => setOpeningBalance(e.target.value)}
            placeholder="0"
          />
        </label>
      </div>

      <div className="space-y-1.5">
        <span className="text-xs text-muted">Color (optional)</span>
        <ColorPicker value={color} onChange={setColor} label="Account color" />
      </div>

      {error ? <p className="text-xs text-danger">Couldn&apos;t add the account. Please try again.</p> : null}

      <div className="flex items-center gap-2">
        <Button loading={busy} disabled={!name.trim()} onClick={submit}>
          Add
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
