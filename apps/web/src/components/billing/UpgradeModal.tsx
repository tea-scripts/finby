'use client';

import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { getPlans, startCheckout } from '@/lib/billing-api';
import { useAuth } from '@/lib/store';
import type { BillingPlan } from '@/lib/types';

type UpgradeTier = 'PRO' | 'PREMIUM' | 'FAMILY';

const TAB_LABELS: { tier: UpgradeTier; label: string }[] = [
  { tier: 'PRO', label: 'Pro' },
  { tier: 'PREMIUM', label: 'Premium' },
  { tier: 'FAMILY', label: 'Family' },
];

export interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  initialTier?: UpgradeTier;
}

export function UpgradeModal({ open, onClose, initialTier = 'PRO' }: UpgradeModalProps) {
  const workspaceId = useAuth((s) => s.workspace?.id);

  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedTier, setSelectedTier] = useState<UpgradeTier>(initialTier);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    setSelectedTier(initialTier);
    setError(null);
    setSubmitError(null);
    setPlans([]);
    setLoading(true);

    let cancelled = false;

    getPlans()
      .then(({ plans: fetched }) => {
        if (!cancelled && mountedRef.current) {
          setPlans(fetched);
        }
      })
      .catch(() => {
        if (!cancelled && mountedRef.current) {
          setError("Couldn't load plans");
        }
      })
      .finally(() => {
        if (!cancelled && mountedRef.current) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, initialTier]);

  const activePlan = plans.find((p) => p.tier === selectedTier) ?? null;

  async function handleUpgrade() {
    if (!workspaceId) {
      setSubmitError('No workspace found. Please reload and try again.');
      return;
    }

    setSubmitError(null);
    setSubmitting(true);

    try {
      const result = await startCheckout(workspaceId, selectedTier);
      window.location.href = result.url;
    } catch {
      if (mountedRef.current) {
        setSubmitError("Couldn't start checkout. Please try again.");
      }
    } finally {
      if (mountedRef.current) {
        setSubmitting(false);
      }
    }
  }

  function selectTier(tier: UpgradeTier) {
    setSelectedTier(tier);
    setSubmitError(null);
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = TAB_LABELS.length - 1;
    let next = index;
    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else return;
    const target = TAB_LABELS[next];
    if (!target) return;
    event.preventDefault();
    selectTier(target.tier);
    tabRefs.current[next]?.focus();
  }

  return (
    <Modal open={open} onClose={onClose} title="Upgrade your plan">
      {/* Tab row */}
      <div
        role="tablist"
        aria-label="Plan tiers"
        className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface-2 p-1"
      >
        {TAB_LABELS.map(({ tier, label }, index) => {
          const selected = selectedTier === tier;
          return (
            <button
              key={tier}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              role="tab"
              id={`upgrade-tab-${tier}`}
              aria-selected={selected}
              aria-controls="upgrade-plan-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => selectTier(tier)}
              onKeyDown={(e) => onTabKeyDown(e, index)}
              className={[
                'flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                selected ? 'bg-accent text-white shadow-sm' : 'text-muted hover:text-ink',
              ].join(' ')}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Body (tab panel) */}
      <div
        role="tabpanel"
        id="upgrade-plan-panel"
        aria-labelledby={`upgrade-tab-${selectedTier}`}
        tabIndex={0}
        className="focus:outline-none"
      >
        {loading && <p className="py-8 text-center text-sm text-muted">Loading plans…</p>}

        {!loading && error && (
          <p className="py-8 text-center text-sm text-red-400">{error}</p>
        )}

        {!loading && !error && activePlan && (
          <div className="space-y-4">
            <p className="text-2xl font-semibold text-ink">{activePlan.priceDisplay}</p>

            <ul className="space-y-2">
              {activePlan.highlights.map((h) => (
                <li key={h} className="flex items-start gap-2 text-sm text-muted">
                  <span className="mt-0.5 text-accent" aria-hidden="true">✓</span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Submit area */}
      <div className="mt-6 space-y-2">
        {submitError && (
          <p className="text-center text-sm text-red-400">{submitError}</p>
        )}
        <Button
          variant="primary"
          loading={submitting}
          disabled={loading || !!error || submitting}
          onClick={handleUpgrade}
          className="w-full"
        >
          Start Upgrade
        </Button>
      </div>
    </Modal>
  );
}
