import type { FeatureBadgeKind, PlanFeature, PlanFeatureSet } from '@/lib/plan-features';

// The single badge pill used everywhere a feature carries a [beta]/[soon]
// qualifier — warning-toned, matching the rounded-pill pattern of TierBadge.
function FeatureBadge({ kind }: { kind: FeatureBadgeKind }) {
  return (
    <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-500/15 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-amber-300">
      {kind}
    </span>
  );
}

/** A single feature row: check marker + label, with optional note, badge, and sub-text. */
export function FeatureRow({ feature }: { feature: PlanFeature }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className="mt-0.5 shrink-0 text-accent" aria-hidden="true">
        ✓
      </span>
      <span className="min-w-0">
        <span className="text-ink">{feature.label}</span>
        {feature.note && <span className="italic text-muted"> ({feature.note})</span>}
        {feature.badge && <FeatureBadge kind={feature.badge} />}
        {feature.subtext && (
          <span className="mt-0.5 block text-xs font-normal text-muted">{feature.subtext}</span>
        )}
      </span>
    </li>
  );
}

/**
 * Renders a tier's full feature list, plus the optional limitation callout
 * (Free) and "coming soon" footer (paid tiers). Shared by the UpgradeModal
 * cards and any other surface that needs the full list.
 */
export function PlanFeatureList({
  featureSet,
  className,
}: {
  featureSet: PlanFeatureSet;
  className?: string;
}) {
  return (
    <div className={className}>
      <ul className="space-y-2">
        {featureSet.features.map((f) => (
          <FeatureRow key={f.label} feature={f} />
        ))}
      </ul>

      {featureSet.limitation && (
        <p className="mt-3 text-xs italic text-muted">{featureSet.limitation}</p>
      )}

      {featureSet.comingSoon && (
        <>
          <hr className="my-3 border-line" />
          <p className="text-xs text-muted">More features on the way</p>
        </>
      )}
    </div>
  );
}
