'use client';

import { useEffect, useRef, useState } from 'react';
import { TIER_LIMITS } from '@finby/shared';
import type { SubscriptionTier } from '@finby/shared';
import { getSubscription, openPortal } from '@/lib/billing-api';
import { useAuth } from '@/lib/store';
import type { SubscriptionView } from '@/lib/types';
import { shortDate } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { UpgradeModal } from '@/components/billing/UpgradeModal';

// ── Tier badge ───────────────────────────────────────────────────────────────

const BADGE_CLASSES: Record<SubscriptionTier, string> = {
  FREE: 'bg-slate-500/15 text-slate-300',
  PRO: 'bg-blue-500/15 text-blue-300',
  PREMIUM: 'bg-purple-500/15 text-purple-300',
  FAMILY: 'bg-emerald-500/15 text-emerald-300',
};

const TIER_LABELS: Record<SubscriptionTier, string> = {
  FREE: 'Free',
  PRO: 'Pro',
  PREMIUM: 'Premium',
  FAMILY: 'Family',
};

function TierBadge({ tier }: { tier: SubscriptionTier }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE_CLASSES[tier]}`}
    >
      {TIER_LABELS[tier]}
    </span>
  );
}

// ── Free-tier limit rows (derived from TIER_LIMITS.FREE) ─────────────────────

const FREE = TIER_LIMITS.FREE;

const FREE_LIMIT_ROWS: { label: string; value: string }[] = [
  {
    label: 'AI messages',
    value: FREE.chatMessagesPerDay !== null ? `${FREE.chatMessagesPerDay}/day` : 'Unlimited',
  },
  {
    label: 'Currencies',
    value: FREE.currencies !== null ? `${FREE.currencies} currency` : 'Unlimited',
  },
  {
    label: 'Transaction history',
    value:
      FREE.transactionHistoryDays !== null
        ? `${FREE.transactionHistoryDays}-day history`
        : 'Unlimited',
  },
  {
    label: 'Custom categories',
    value:
      FREE.customCategories !== null ? `${FREE.customCategories} categories` : 'Unlimited',
  },
  {
    label: 'Members',
    value: `${FREE.maxMembers} member`,
  },
];

// ── Compare plans feature rows (static concise list) ─────────────────────────

const COMPARE_ROWS: { feature: string; free: string; pro: string; premium: string; family: string }[] =
  [
    { feature: 'AI messages/day', free: '20', pro: 'Unlimited', premium: 'Unlimited', family: 'Unlimited' },
    { feature: 'Currencies', free: '1', pro: 'Unlimited', premium: 'Unlimited', family: 'Unlimited' },
    { feature: 'History', free: '90 days', pro: 'Unlimited', premium: 'Unlimited', family: 'Unlimited' },
    { feature: 'Portfolio', free: '—', pro: '✓', premium: '✓', family: '✓' },
    { feature: 'AI coaching', free: '—', pro: '—', premium: '✓', family: '✓' },
    { feature: 'Members', free: '1', pro: '1', premium: '1', family: 'Up to 5' },
    { feature: 'Data export', free: '—', pro: '✓', premium: '✓', family: '✓' },
  ];

// ── PlanCard ─────────────────────────────────────────────────────────────────

export function PlanCard() {
  const workspace = useAuth((s) => s.workspace);

  const [sub, setSub] = useState<SubscriptionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);

  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!workspace) return;

    setLoading(true);
    setError(false);

    getSubscription(workspace.id)
      .then((data) => {
        if (mountedRef.current) {
          setSub(data);
        }
      })
      .catch(() => {
        if (mountedRef.current) {
          setError(true);
        }
      })
      .finally(() => {
        if (mountedRef.current) {
          setLoading(false);
        }
      });
  }, [workspace]);

  async function handleManageBilling() {
    if (!workspace) return;
    setPortalError(null);
    setPortalLoading(true);
    try {
      const { url } = await openPortal(workspace.id);
      window.location.href = url;
    } catch {
      if (mountedRef.current) {
        setPortalError('Unable to open billing portal. Please try again.');
      }
    } finally {
      if (mountedRef.current) {
        setPortalLoading(false);
      }
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <section
        aria-busy="true"
        data-testid="plan-card-loading"
        className="rounded-2xl border border-line bg-surface/60 p-5 shadow-card"
      >
        <Skeleton className="mb-3 h-4 w-24" />
        <Skeleton className="mb-2 h-6 w-40" />
        <Skeleton className="h-4 w-32" />
      </section>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error || !sub) {
    return (
      <section className="rounded-2xl border border-line bg-surface/60 p-5 shadow-card">
        <p className="text-sm text-danger">Unable to load plan details</p>
      </section>
    );
  }

  const isFree = sub.tier === 'FREE';

  // ── Free tier ────────────────────────────────────────────────────────────
  if (isFree) {
    return (
      <>
        <section className="rounded-2xl border border-line bg-surface/60 p-5 shadow-card space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
              Current Plan
            </h2>
            <TierBadge tier="FREE" />
          </div>

          {/* Free limits (derived from TIER_LIMITS.FREE) */}
          <ul className="space-y-1.5">
            {FREE_LIMIT_ROWS.map(({ label, value }) => (
              <li key={label} className="flex items-center justify-between text-sm">
                <span className="text-muted">{label}</span>
                <span className="font-medium text-ink">{value}</span>
              </li>
            ))}
          </ul>

          {/* Upgrade CTA */}
          <Button
            variant="primary"
            className="w-full"
            onClick={() => setUpgradeOpen(true)}
          >
            Upgrade to Pro
          </Button>

          {/* Compare plans toggle */}
          <button
            onClick={() => setCompareOpen((o) => !o)}
            className="w-full text-center text-xs text-accent hover:text-accent-hover focus:outline-none"
            aria-expanded={compareOpen}
          >
            {compareOpen ? 'Hide plan comparison' : 'Compare plans'}
          </button>

          {compareOpen && <CompareTable />}
        </section>

        <UpgradeModal
          open={upgradeOpen}
          onClose={() => setUpgradeOpen(false)}
          initialTier="PRO"
        />
      </>
    );
  }

  // ── Paid tier ────────────────────────────────────────────────────────────
  return (
    <section className="rounded-2xl border border-line bg-surface/60 p-5 shadow-card space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
          Current Plan
        </h2>
        <TierBadge tier={sub.tier} />
      </div>

      {/* Billing info */}
      <div className="space-y-1">
        {sub.currentPeriodEnd && (
          <p className="text-sm text-muted">
            Next billing date:{' '}
            <span className="font-medium text-ink">{shortDate(sub.currentPeriodEnd)}</span>
          </p>
        )}
        {sub.cancelAtPeriodEnd && (
          <p className="text-sm text-amber-400">
            Your plan cancels at the end of the current period.
          </p>
        )}
      </div>

      {/* Manage Billing (Stripe only) */}
      {sub.billingProvider === 'STRIPE' && (
        <div className="space-y-1">
          {portalError && (
            <p className="text-xs text-danger">{portalError}</p>
          )}
          <Button
            variant="ghost"
            loading={portalLoading}
            onClick={handleManageBilling}
            className="w-full sm:w-auto"
          >
            Manage Billing
          </Button>
        </div>
      )}

      {/* Compare plans toggle */}
      <button
        onClick={() => setCompareOpen((o) => !o)}
        className="w-full text-center text-xs text-accent hover:text-accent-hover focus:outline-none"
        aria-expanded={compareOpen}
      >
        {compareOpen ? 'Hide plan comparison' : 'Compare plans'}
      </button>

      {compareOpen && <CompareTable />}
    </section>
  );
}

// ── CompareTable (collapsible feature comparison) ────────────────────────────

function CompareTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="py-1 text-left font-medium text-muted">Feature</th>
            <th className="py-1 text-center font-medium text-muted">Free</th>
            <th className="py-1 text-center font-medium text-blue-300">Pro</th>
            <th className="py-1 text-center font-medium text-purple-300">Premium</th>
            <th className="py-1 text-center font-medium text-emerald-300">Family</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {COMPARE_ROWS.map((row) => (
            <tr key={row.feature}>
              <td className="py-1.5 text-muted">{row.feature}</td>
              <td className="py-1.5 text-center text-ink">{row.free}</td>
              <td className="py-1.5 text-center text-ink">{row.pro}</td>
              <td className="py-1.5 text-center text-ink">{row.premium}</td>
              <td className="py-1.5 text-center text-ink">{row.family}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
