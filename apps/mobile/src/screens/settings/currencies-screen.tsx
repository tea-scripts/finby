import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CURRENCIES } from '@finby/shared';
import { ApiError } from '@finby/core';
import { SettingsHeader } from '../../components/settings/settings-header';
import { Field } from '../../components/ui/field';
import { Dropdown } from '../../components/ui/dropdown';
import { Button } from '../../components/ui/button';
import { ConfirmSheet } from '../../components/settings/confirm-sheet';
import { UpgradeGate } from '../../components/settings/upgrade-gate';
import { useAuthStore } from '../../lib/use-auth-store';
import { api } from '../../lib/runtime.native';

const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }));

export function CurrenciesScreen() {
  const workspace = useAuthStore((s) => s.workspace);
  const setWorkspace = useAuthStore((s) => s.setWorkspace);
  const base = workspace?.baseCurrency ?? 'USD';

  const [pendingBase, setPendingBase] = useState<string | null>(null);
  const [changingBase, setChangingBase] = useState(false);
  const [recomputed, setRecomputed] = useState<number | null>(null);
  const [baseError, setBaseError] = useState<string | null>(null);

  const [selected, setSelected] = useState<string[]>(workspace?.preferredCurrencies ?? [base]);
  const [savingPreferred, setSavingPreferred] = useState(false);
  const preferredDirty = useMemo(() => {
    const a = [...selected].sort().join(',');
    const b = [...(workspace?.preferredCurrencies ?? [])].sort().join(',');
    return a !== b;
  }, [selected, workspace?.preferredCurrencies]);

  async function confirmBaseChange() {
    if (!workspace || !pendingBase) return;
    setChangingBase(true);
    setBaseError(null);
    try {
      const res = await api.settings.updateBaseCurrency(workspace.id, pendingBase);
      setWorkspace({ baseCurrency: res.baseCurrency, preferredCurrencies: res.preferredCurrencies });
      setSelected(res.preferredCurrencies);
      setRecomputed(res.recomputed);
      setPendingBase(null);
    } catch (e) {
      setBaseError(e instanceof ApiError ? e.message : 'Could not change base currency.');
    } finally {
      setChangingBase(false);
    }
  }

  function toggleCurrency(code: string) {
    if (code === base) return; // base is always on + locked
    setSelected((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  async function savePreferred() {
    if (!workspace) return;
    setSavingPreferred(true);
    try {
      const res = await api.settings.updateCurrencies(workspace.id, selected);
      setWorkspace({ preferredCurrencies: res.preferredCurrencies });
      setSelected(res.preferredCurrencies);
    } catch {
      /* surfaced via toast elsewhere; keep local state */
    } finally {
      setSavingPreferred(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom']}>
      <SettingsHeader title="Currencies" />
      <ScrollView contentContainerClassName="gap-6 p-6">
        <Field label="Base currency" hint={`All totals are reported in ${base}.`}>
          <Dropdown
            value={base}
            options={CURRENCY_OPTIONS}
            accessibilityLabel="Base currency"
            onSelect={(code) => { if (code !== base) { setPendingBase(code); setRecomputed(null); } }}
          />
        </Field>
        {recomputed !== null ? (
          <Text className="text-sm text-success">Recalculated {recomputed} transaction(s) into {base}.</Text>
        ) : null}
        {baseError ? <Text className="text-sm text-danger">{baseError}</Text> : null}

        <View className="gap-2">
          <Text className="text-xs font-semibold uppercase tracking-wide text-muted">Currencies you use</Text>
          <UpgradeGate currentTier={workspace?.tier ?? 'FREE'} requiredTier="PRO">
            <View className="flex-row flex-wrap gap-2">
              {CURRENCIES.map((c) => {
                const on = selected.includes(c.code);
                const locked = c.code === base;
                return (
                  <Pressable
                    key={c.code}
                    onPress={() => toggleCurrency(c.code)}
                    disabled={locked}
                    accessibilityRole="button"
                    accessibilityLabel={`${c.code} ${on ? 'selected' : 'not selected'}`}
                    className={`rounded-full border px-3 py-1.5 ${on ? 'border-accent bg-accent/15' : 'border-line bg-surface'} ${locked ? 'opacity-70' : ''}`}
                  >
                    <Text className={`text-sm ${on ? 'text-accent' : 'text-ink'}`}>{c.symbol} {c.code}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Button disabled={!preferredDirty} loading={savingPreferred} onPress={() => void savePreferred()}>Save</Button>
          </UpgradeGate>
        </View>
      </ScrollView>

      <ConfirmSheet
        open={pendingBase !== null}
        onClose={() => setPendingBase(null)}
        busy={changingBase}
        title="Change base currency"
        message={`This recalculates all your transactions, budgets and investments into ${pendingBase ?? ''}. This can take a moment.`}
        confirmLabel="Confirm change"
        onConfirm={() => void confirmBaseChange()}
      />
    </SafeAreaView>
  );
}
