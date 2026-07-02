import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, CURRENCIES, type AccountType, type AccountView } from '@finby/shared';
import { ApiError, money } from '@finby/core';
import { SettingsHeader } from '../../components/settings/settings-header';
import { SectionLoading, SectionError } from '../../components/dashboard/section-card';
import { BottomSheet } from '../../components/ui/bottom-sheet';
import { Field } from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { Dropdown } from '../../components/ui/dropdown';
import { Button } from '../../components/ui/button';
import { ColorPicker } from '../../components/settings/color-picker';
import { ConfirmSheet } from '../../components/settings/confirm-sheet';
import { useTabBarSpace } from '../../components/nav/floating-tab-bar';
import { useWorkspaceRole } from '../../lib/use-workspace-role';
import { useAuthStore } from '../../lib/use-auth-store';
import { api } from '../../lib/runtime.native';
import { formatAmountInput } from '../../lib/format-amount-input';

const TYPE_OPTIONS = ACCOUNT_TYPES.map((t) => ({ value: t, label: ACCOUNT_TYPE_LABELS[t] }));

export function AccountsScreen() {
  const workspace = useAuthStore((s) => s.workspace);
  const role = useWorkspaceRole();
  const canManage = role !== 'VIEWER';

  const currencyOptions = useMemo(() => {
    const codes = Array.from(new Set([workspace?.baseCurrency, ...(workspace?.preferredCurrencies ?? [])].filter(Boolean) as string[]));
    return CURRENCIES.filter((c) => codes.includes(c.code)).map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }));
  }, [workspace?.baseCurrency, workspace?.preferredCurrencies]);

  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [sheet, setSheet] = useState<{ mode: 'add' } | { mode: 'edit'; account: AccountView } | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('BANK');
  const [currency, setCurrency] = useState(workspace?.baseCurrency ?? 'USD');
  const [initialBalance, setInitialBalance] = useState('0');
  const [color, setColor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [archiveTarget, setArchiveTarget] = useState<AccountView | null>(null);
  const tabBarSpace = useTabBarSpace();

  const load = useCallback(() => {
    if (!workspace) return;
    setLoading(true);
    setLoadError(false);
    api.dashboard
      .listAccounts(workspace.id)
      .then(setAccounts)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [workspace]);

  const initialized = useRef(false);
  useEffect(() => {
    if (!workspace || initialized.current) return;
    initialized.current = true;
    load();
  }, [workspace, load]);

  function upsert(acc: AccountView) {
    setAccounts((prev) => (prev.some((a) => a.id === acc.id) ? prev.map((a) => (a.id === acc.id ? acc : a)) : [...prev, acc]));
  }

  function openAdd() {
    setName('');
    setType('BANK');
    setCurrency(workspace?.baseCurrency ?? 'USD');
    setInitialBalance('0');
    setColor(null);
    setSheet({ mode: 'add' });
  }

  function openEdit(acc: AccountView) {
    setName(acc.name);
    setColor(acc.color);
    setSheet({ mode: 'edit', account: acc });
  }

  async function submit() {
    if (!workspace || !name.trim() || !sheet) return;
    setBusy(true);
    try {
      if (sheet.mode === 'add') {
        const acc = await api.accounts.createAccount(workspace.id, {
          name: name.trim(),
          accountType: type,
          currency,
          initialBalance: initialBalance.replace(/,/g, '').replace(/\.$/, '').trim() || '0',
          ...(color ? { color } : {}),
        });
        upsert(acc);
      } else {
        const acc = await api.accounts.updateAccount(workspace.id, sheet.account.id, {
          name: name.trim(),
          color,
        });
        upsert(acc);
      }
      setSheet(null);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive(acc: AccountView) {
    setBusy(true);
    try {
      const updated = await api.accounts.updateAccount(workspace!.id, acc.id, { isArchived: !acc.isArchived });
      upsert(updated);
      setArchiveTarget(null);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
    } finally {
      setBusy(false);
    }
  }

  const active = accounts.filter((a) => !a.isArchived);
  const archived = accounts.filter((a) => a.isArchived);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <SettingsHeader title="Accounts" />
      <ScrollView contentContainerClassName="gap-4 p-6" contentContainerStyle={{ paddingBottom: tabBarSpace }}>
        {loading ? (
          <SectionLoading />
        ) : loadError ? (
          <SectionError onRetry={load} />
        ) : (
          <>
            {!canManage ? (
              <Text className="text-sm text-muted">Only owners and co-managers can add or edit accounts.</Text>
            ) : null}

            {[...active, ...archived].map((acc) => (
              <View key={acc.id} className="flex-row items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
                <View className="flex-1 flex-row items-center gap-2.5 pr-2">
                  {acc.color ? <View style={{ backgroundColor: acc.color }} className="h-3 w-3 rounded-full" /> : null}
                  <View className="flex-1">
                    <Text numberOfLines={1} className="text-base text-ink">
                      {acc.name}{acc.isArchived ? ' (archived)' : ''}
                    </Text>
                    <Text className="text-xs text-faint">{ACCOUNT_TYPE_LABELS[acc.accountType as AccountType] ?? acc.accountType}</Text>
                  </View>
                </View>
                <View className="items-end gap-1">
                  <Text className="text-sm text-ink">{money(acc.balance, acc.currency)}</Text>
                  {canManage ? (
                    <View className="flex-row gap-3">
                      <Button variant="link" accessibilityLabel={`Edit ${acc.name}`} onPress={() => openEdit(acc)}>
                        Edit
                      </Button>
                      <Button variant="link" onPress={() => setArchiveTarget(acc)}>
                        {acc.isArchived ? 'Unarchive' : 'Archive'}
                      </Button>
                    </View>
                  ) : null}
                </View>
              </View>
            ))}

            {canManage ? (
              <Button variant="ghost" onPress={openAdd}>Add account</Button>
            ) : null}
          </>
        )}
      </ScrollView>

      <BottomSheet open={sheet !== null} onClose={() => setSheet(null)} title={sheet?.mode === 'edit' ? 'Edit account' : 'Add account'}>
        <View className="gap-4">
          <Field label="Name"><Input value={name} onChangeText={setName} placeholder="e.g. BDO Savings" accessibilityLabel="Account name" /></Field>
          {sheet?.mode === 'add' ? (
            <>
              <Field label="Type"><Dropdown value={type} options={TYPE_OPTIONS} accessibilityLabel="Account type" onSelect={setType} /></Field>
              <Field label="Currency"><Dropdown value={currency} options={currencyOptions} accessibilityLabel="Account currency" onSelect={setCurrency} /></Field>
              <Field label="Opening balance">
                <Input
                  value={initialBalance}
                  onChangeText={(t) => setInitialBalance(formatAmountInput(t))}
                  keyboardType="decimal-pad"
                  accessibilityLabel="Opening balance"
                />
              </Field>
            </>
          ) : null}
          <Field label="Color"><ColorPicker value={color} onChange={setColor} /></Field>
          <Button disabled={!name.trim()} loading={busy} onPress={() => void submit()}>
            {sheet?.mode === 'edit' ? 'Save' : 'Add'}
          </Button>
        </View>
      </BottomSheet>

      <ConfirmSheet
        open={archiveTarget !== null}
        onClose={() => setArchiveTarget(null)}
        busy={busy}
        title={archiveTarget?.isArchived ? 'Unarchive account' : 'Archive account'}
        message={archiveTarget?.isArchived
          ? `Restore ${archiveTarget?.name} to your active accounts?`
          : `Archive ${archiveTarget?.name}? It stays in your history but is hidden from active lists.`}
        confirmLabel={archiveTarget?.isArchived ? 'Unarchive' : 'Archive'}
        onConfirm={() => archiveTarget && void toggleArchive(archiveTarget)}
      />
    </SafeAreaView>
  );
}
