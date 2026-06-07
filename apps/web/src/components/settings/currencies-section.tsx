'use client';

import { useMemo, useState } from 'react';
import { CURRENCIES } from '@finby/shared';
import type { SubscriptionTier } from '@finby/shared';
import { Button } from '@/components/ui/button';
import { UpgradeGate } from '@/components/billing/UpgradeGate';
import { updateCurrencies } from '@/lib/settings-api';
import { useAuth } from '@/lib/store';

const RANK: Record<SubscriptionTier, number> = {
  FREE: 0,
  PRO: 1,
  PREMIUM: 2,
  FAMILY: 3,
};

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/** Multi-select of "currencies I use". Base is always selected + locked. */
export function CurrenciesSection() {
  const workspace = useAuth((s) => s.workspace);
  const setPreferredCurrencies = useAuth((s) => s.setPreferredCurrencies);

  const tier = workspace?.tier ?? 'FREE';
  const base = workspace?.baseCurrency ?? 'USD';
  const isPro = RANK[tier] >= RANK.PRO;

  const saved = useMemo(
    () => new Set(workspace?.preferredCurrencies ?? [base]),
    [workspace?.preferredCurrencies, base],
  );

  const [selected, setSelected] = useState<Set<string>>(() => new Set(saved));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  function toggle(code: string) {
    if (code === base) return; // base is locked
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  const dirty = !sameSet(selected, saved);

  async function handleSave() {
    if (!workspace) return;
    setSaving(true);
    setError(false);
    try {
      const result = await updateCurrencies(workspace.id, Array.from(selected));
      setPreferredCurrencies(result.preferredCurrencies);
      setSelected(new Set(result.preferredCurrencies));
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
        Currencies
      </h2>

      <UpgradeGate requiredTier="PRO" featureName="Multiple currencies">
        <div className="space-y-4 rounded-2xl border border-line bg-surface/60 p-5 shadow-card">
          <p className="text-xs text-muted">
            Pick the currencies you use. Your base currency ({base}) is always on.
          </p>

          <div className="flex flex-wrap gap-2">
            {CURRENCIES.map((c) => {
              const active = selected.has(c.code);
              const locked = c.code === base;
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => toggle(c.code)}
                  disabled={locked}
                  aria-pressed={active}
                  className={[
                    'rounded-xl border px-3 py-1.5 text-sm font-medium transition',
                    active
                      ? 'border-accent bg-accent/10 text-ink'
                      : 'border-line bg-surface text-muted hover:border-accent/50 hover:text-ink',
                    locked ? 'cursor-not-allowed opacity-70' : '',
                  ].join(' ')}
                >
                  <span className="mr-1 text-muted">{c.symbol}</span>
                  {c.code}
                </button>
              );
            })}
          </div>

          {error ? (
            <p className="text-xs text-danger">Couldn&apos;t update currencies.</p>
          ) : null}

          <Button onClick={handleSave} disabled={!dirty || saving} loading={saving}>
            Save
          </Button>
        </div>
      </UpgradeGate>

      {isPro ? null : (
        <p className="text-xs text-muted">
          Your base currency {base} is always tracked.
        </p>
      )}
    </section>
  );
}
