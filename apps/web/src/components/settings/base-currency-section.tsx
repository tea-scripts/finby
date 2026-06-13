'use client';

import { useEffect, useState } from 'react';
import { CURRENCIES } from '@finby/shared';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { updateBaseCurrency } from '@/lib/settings-api';
import { useAuth } from '@/lib/store';

const OPTIONS = CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }));

/** Editable base (reporting) currency. Changing it recomputes all historical totals. */
export function BaseCurrencySection() {
  const workspace = useAuth((s) => s.workspace);
  const setBaseCurrency = useAuth((s) => s.setBaseCurrency);

  const base = workspace?.baseCurrency ?? 'USD';
  const [selected, setSelected] = useState(base);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [recomputed, setRecomputed] = useState<number | null>(null);

  // Keep local selection in sync if the workspace's base currency changes elsewhere.
  useEffect(() => {
    setSelected(base);
    setConfirming(false);
  }, [base]);

  const dirty = selected !== base;

  async function handleConfirm() {
    if (!workspace || saving) return;
    setSaving(true);
    setError(false);
    try {
      const result = await updateBaseCurrency(workspace.id, selected);
      setBaseCurrency(result.baseCurrency, result.preferredCurrencies);
      setSelected(result.baseCurrency);
      setConfirming(false);
      setRecomputed(result.recomputed);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
        Base currency
      </h2>

      <div className="space-y-4 rounded-2xl border border-line bg-surface/60 p-5 shadow-card">
        <p className="text-xs text-muted">
          The currency all your totals are reported in. It&apos;s currently {base}.
        </p>

        <Dropdown
          id="baseCurrency"
          aria-label="Base currency"
          value={selected}
          onChange={(value) => {
            setSelected(value);
            setConfirming(false);
            setRecomputed(null);
          }}
          options={OPTIONS}
          disabled={saving}
        />

        {confirming ? (
          <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
            <p className="text-sm text-ink">
              Change your base currency to {selected}? This will recalculate every transaction,
              budget, and investment into {selected}. Older amounts in currencies without
              historical rates use today&apos;s rate.
            </p>
            <div className="flex gap-2">
              <Button onClick={handleConfirm} loading={saving} disabled={saving}>
                Confirm change
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={() => setConfirming(true)} disabled={!dirty}>
            Change base currency
          </Button>
        )}

        {recomputed !== null && !confirming ? (
          <p className="text-xs text-muted">
            Recalculated {recomputed} transaction{recomputed === 1 ? '' : 's'} into {base}.
          </p>
        ) : null}

        {error ? (
          <p className="text-xs text-danger">Couldn&apos;t change base currency. Please try again.</p>
        ) : null}
      </div>
    </section>
  );
}
