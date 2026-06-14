'use client';
import type { FunnelMetrics } from '@finby/shared';

/**
 * Horizontal funnel: each step is a proportional bar (width = % of step 1),
 * annotated with its absolute count and step-to-step conversion. Renders a
 * setup hint instead of an empty chart when PostHog isn't configured.
 */
export function FunnelChart({ data }: { data: FunnelMetrics }) {
  if (!data.configured) {
    return (
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="mb-1 text-sm font-medium text-muted">{data.label} funnel</div>
        <p className="text-sm text-muted">
          PostHog is not configured. Set POSTHOG_API_KEY and POSTHOG_PROJECT_ID on the API to
          enable behavioural funnels.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <div className="text-sm font-medium text-muted">{data.label} funnel</div>
        <div className="text-xs text-muted">last {data.windowDays} days</div>
      </div>
      <div className="space-y-2">
        {data.steps.map((step, i) => (
          <div key={step.event}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="text-ink">{step.label}</span>
              <span className="text-muted">
                <span className="font-display font-semibold text-ink">{step.count}</span>
                {i > 0 && <span className="ml-2">{step.conversionFromPrev}% from prev</span>}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.max(step.conversionFromStart, 1)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
