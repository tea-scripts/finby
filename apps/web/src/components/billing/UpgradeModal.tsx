'use client';

import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { getPlans, startCheckout, changePlan, openBillingUrl } from '@/lib/billing-api';
import { useAuth } from '@/lib/store';
import { track } from '@/lib/analytics';
import { PLAN_FEATURES } from '@/lib/plan-features';
import { PlanFeatureList } from '@/components/billing/PlanFeatureList';
import type { BillingPlan } from '@/lib/types';

type UpgradeTier = 'PRO' | 'PREMIUM' | 'FAMILY';

const TIER_ORDER: UpgradeTier[] = ['PRO', 'PREMIUM', 'FAMILY'];
const TIER_RANK: Record<UpgradeTier, number> = { PRO: 1, PREMIUM: 2, FAMILY: 3 };
const TIER_LABEL: Record<UpgradeTier, string> = { PRO: 'Pro', PREMIUM: 'Premium', FAMILY: 'Family' };

export interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  initialTier?: UpgradeTier;
  source?: string;
  currentTier?: UpgradeTier;
}

export function UpgradeModal({
  open,
  onClose,
  initialTier = 'PRO',
  source = 'unknown',
  currentTier,
}: UpgradeModalProps) {
  const workspaceId = useAuth((s) => s.workspace?.id);

  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The card currently centered in the carousel (drives the position dots + arrows).
  const [focusedTier, setFocusedTier] = useState<UpgradeTier>(initialTier);

  // Which tier's CTA is mid-request (so only that card's button shows a spinner).
  const [submittingTier, setSubmittingTier] = useState<UpgradeTier | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Partial<Record<UpgradeTier, HTMLDivElement | null>>>({});
  const sourceRef = useRef(source);
  sourceRef.current = source;

  const manageMode = !!currentTier;
  const startTier = currentTier ?? initialTier;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    track('upgrade_modal_viewed', { source: sourceRef.current });

    setFocusedTier(startTier);
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
  }, [open, startTier]);

  // Order the fetched plans by tier rank so the deck reads Pro → Premium → Family.
  const orderedPlans = TIER_ORDER.map((tier) => plans.find((p) => p.tier === tier)).filter(
    (p): p is BillingPlan => !!p,
  );

  // Center the starting plan once the cards have rendered.
  useEffect(() => {
    if (!open || loading || error || orderedPlans.length === 0) return;
    scrollToTier(startTier, false);
  }, [open, loading, error, orderedPlans.length]);

  function scrollToTier(tier: UpgradeTier, smooth = true) {
    const card = cardRefs.current[tier];
    setFocusedTier(tier);
    card?.scrollIntoView?.({ behavior: smooth ? 'smooth' : 'auto', inline: 'center', block: 'nearest' });
  }

  // Track the nearest card to the viewport center as the user swipes.
  function onCarouselScroll() {
    const container = scrollRef.current;
    if (!container) return;
    const center = container.scrollLeft + container.clientWidth / 2;
    let nearest: UpgradeTier = focusedTier;
    let best = Infinity;
    for (const tier of TIER_ORDER) {
      const card = cardRefs.current[tier];
      if (!card) continue;
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const dist = Math.abs(cardCenter - center);
      if (dist < best) {
        best = dist;
        nearest = tier;
      }
    }
    if (nearest !== focusedTier) setFocusedTier(nearest);
  }

  function step(delta: -1 | 1) {
    const idx = TIER_ORDER.indexOf(focusedTier);
    const next = TIER_ORDER[idx + delta];
    if (next) scrollToTier(next);
  }

  function onCarouselKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      step(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      step(-1);
    }
  }

  async function handleUpgrade(tier: UpgradeTier) {
    if (!workspaceId) {
      setSubmitError('No workspace found. Please reload and try again.');
      return;
    }
    setSubmitError(null);
    setSubmittingTier(tier);
    try {
      track('checkout_started', { target_tier: tier });
      await openBillingUrl(async () => (await startCheckout(workspaceId, tier)).url);
    } catch {
      if (mountedRef.current) {
        setSubmitError("Couldn't start checkout. Please try again.");
      }
    } finally {
      if (mountedRef.current) {
        setSubmittingTier(null);
      }
    }
  }

  async function handleChangePlan(tier: UpgradeTier) {
    if (!workspaceId) {
      setSubmitError('No workspace found. Please reload and try again.');
      return;
    }
    setSubmitError(null);
    setSubmittingTier(tier);
    try {
      await changePlan(workspaceId, tier);
      onClose();
    } catch {
      if (mountedRef.current) {
        setSubmitError("Couldn't change your plan. Please try again.");
      }
    } finally {
      if (mountedRef.current) {
        setSubmittingTier(null);
      }
    }
  }

  /** Per-card call to action, derived from the tier's relationship to the current plan. */
  function cardCta(tier: UpgradeTier): {
    label: string;
    note: string | null;
    disabled: boolean;
    onClick?: () => void;
  } {
    if (manageMode && tier === currentTier) {
      return { label: 'Current plan', note: "You're on this plan", disabled: true };
    }
    if (manageMode) {
      const downgrade = TIER_RANK[tier] < TIER_RANK[currentTier as UpgradeTier];
      return downgrade
        ? {
            label: `Switch to ${TIER_LABEL[tier]}`,
            note: 'Starts at the end of your billing period',
            disabled: false,
            onClick: () => handleChangePlan(tier),
          }
        : {
            label: `Upgrade to ${TIER_LABEL[tier]}`,
            note: 'Takes effect now · prorated',
            disabled: false,
            onClick: () => handleChangePlan(tier),
          };
    }
    return {
      label: `Upgrade to ${TIER_LABEL[tier]}`,
      note: null,
      disabled: false,
      onClick: () => handleUpgrade(tier),
    };
  }

  return (
    <Modal open={open} onClose={onClose} bare title={manageMode ? 'Change your plan' : 'Upgrade your plan'}>
      {loading && <p className="py-10 text-center text-sm text-muted">Loading plans…</p>}

      {!loading && error && <p className="py-10 text-center text-sm text-red-400">{error}</p>}

      {!loading && !error && orderedPlans.length > 0 && (
        <div
          role="group"
          aria-roledescription="carousel"
          aria-label="Plans"
          tabIndex={0}
          onKeyDown={onCarouselKeyDown}
          className="focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-2xl"
        >
          {/* Swipeable deck — current card full, neighbours peek at the edges */}
          <div
            ref={scrollRef}
            onScroll={onCarouselScroll}
            className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-[10%] pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {orderedPlans.map((plan) => {
              const tier = plan.tier as UpgradeTier;
              const isCurrent = manageMode && tier === currentTier;
              const cta = cardCta(tier);
              return (
                <div
                  key={tier}
                  ref={(el) => {
                    cardRefs.current[tier] = el;
                  }}
                  role="group"
                  aria-label={`${TIER_LABEL[tier]} plan`}
                  aria-current={isCurrent ? 'true' : undefined}
                  className={[
                    'snap-center shrink-0 basis-[80%] rounded-2xl border p-5 transition',
                    focusedTier === tier
                      ? 'border-accent/60 bg-surface-2 shadow-card'
                      : 'border-line bg-surface/60 opacity-70',
                  ].join(' ')}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <h3 className="font-display text-base font-semibold text-ink">
                      {TIER_LABEL[tier]}
                    </h3>
                    {isCurrent && (
                      <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">
                        Current plan
                      </span>
                    )}
                  </div>

                  <p className="mb-3 text-2xl font-semibold text-ink">{plan.priceDisplay}</p>

                  <PlanFeatureList className="mb-4" featureSet={PLAN_FEATURES[tier]} />

                  <Button
                    variant={isCurrent ? 'ghost' : 'primary'}
                    loading={submittingTier === tier}
                    disabled={cta.disabled || submittingTier !== null}
                    onClick={cta.onClick}
                    className="w-full"
                  >
                    {cta.label}
                  </Button>
                  {cta.note && (
                    <p className="mt-2 text-center text-xs text-muted">{cta.note}</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Position dots */}
          <div className="mt-4 flex items-center justify-center gap-3" role="tablist" aria-label="Choose a plan">
            <button
              type="button"
              aria-label="Previous plan"
              disabled={focusedTier === TIER_ORDER[0]}
              onClick={() => step(-1)}
              className="text-muted transition hover:text-ink disabled:opacity-30"
            >
              ‹
            </button>
            {orderedPlans.map((plan) => {
              const tier = plan.tier as UpgradeTier;
              const active = focusedTier === tier;
              return (
                <button
                  key={tier}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-label={`Show ${TIER_LABEL[tier]} plan`}
                  onClick={() => scrollToTier(tier)}
                  className={[
                    'h-2 rounded-full transition-all',
                    active ? 'w-5 bg-accent' : 'w-2 bg-line hover:bg-muted',
                  ].join(' ')}
                />
              );
            })}
            <button
              type="button"
              aria-label="Next plan"
              disabled={focusedTier === TIER_ORDER[TIER_ORDER.length - 1]}
              onClick={() => step(1)}
              className="text-muted transition hover:text-ink disabled:opacity-30"
            >
              ›
            </button>
          </div>
        </div>
      )}

      {submitError && <p className="mt-4 text-center text-sm text-red-400">{submitError}</p>}
    </Modal>
  );
}
