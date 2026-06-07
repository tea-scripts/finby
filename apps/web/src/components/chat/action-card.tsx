'use client';

import { Lottie } from '@/components/ui/lottie';
import type { ChatAction } from '@/lib/types';
import { useFormatters } from '@/lib/use-formatters';

/** Renders a committed action (TRANSACTION_CREATED or BUDGET_SET) as a
 *  compact card. Money is shown in Geist Mono per the brand. */
export function ActionCard({ action }: { action: ChatAction }) {
  const { formatMoney } = useFormatters();

  if (action.type === 'BUDGET_SET') {
    return (
      <div className="rounded-xl border border-line bg-surface/60 px-3 py-2 text-xs text-muted">
        Budget set{action.preview.category ? ` for ${action.preview.category}` : ''}.
      </div>
    );
  }

  const { preview } = action;
  return (
    <div className="mt-2 rounded-xl border border-line bg-surface-2/70 p-3.5 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-success">
          <Lottie src="/lottie/success.json" loop={false} className="h-5 w-5" />
          Logged
        </span>
        <span className="font-mono text-base font-semibold text-ink">
          {formatMoney(preview.amount, preview.currency)}
        </span>
      </div>
      {(preview.merchant || preview.category) && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {preview.merchant && (
            <span className="rounded-md border border-line bg-canvas/60 px-2 py-0.5 text-xs text-muted">
              {preview.merchant}
            </span>
          )}
          {preview.category && (
            <span className="rounded-md border border-accent/30 bg-accent-soft px-2 py-0.5 text-xs text-accent">
              {preview.category}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
