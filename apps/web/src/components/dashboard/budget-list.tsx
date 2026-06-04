import { Skeleton } from '@/components/ui/skeleton';
import type { SectionState } from '@/lib/dashboard-api';
import { money } from '@/lib/format';
import type { BudgetView } from '@/lib/types';
import { DashboardCard, SectionEmpty, SectionError } from './dashboard-card';

function barColor(pct: number): string {
  if (pct >= 100) return 'bg-danger';
  if (pct >= 75) return 'bg-warn';
  return 'bg-success';
}

function BudgetRow({ budget }: { budget: BudgetView }) {
  const pct = Math.round(budget.utilizationPercent);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-ink">{budget.category.name}</span>
        <span className="font-mono text-xs text-muted">
          {money(budget.amountSpent, budget.currency)} / {money(budget.amountLimit, budget.currency)}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div
            className={`h-full rounded-full ${barColor(pct)}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <span className="w-9 shrink-0 text-right text-xs text-muted">{pct}%</span>
      </div>
    </div>
  );
}

export function BudgetList({ state }: { state: SectionState<BudgetView[]> }) {
  return (
    <DashboardCard title="Budgets">
      {state.loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </div>
      ) : state.error ? (
        <SectionError message={state.error} />
      ) : !state.data || state.data.length === 0 ? (
        <SectionEmpty message="No budgets yet. Ask Finby to set one — “budget 300 for dining”." />
      ) : (
        <div className="space-y-4">
          {state.data.map((b) => (
            <BudgetRow key={b.id} budget={b} />
          ))}
        </div>
      )}
    </DashboardCard>
  );
}
