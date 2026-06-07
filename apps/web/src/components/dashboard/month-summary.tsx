'use client';

import { Skeleton } from '@/components/ui/skeleton';
import type { SectionState } from '@/lib/dashboard-api';
import { useFormatters } from '@/lib/use-formatters';
import type { SummaryResult } from '@/lib/types';
import { DashboardCard, SectionError } from './dashboard-card';

function Stat({ label, value, tone = 'ink' }: { label: string; value: string; tone?: 'ink' | 'success' | 'danger' }) {
  const toneClass = tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-ink';
  return (
    <div className="rounded-xl border border-line bg-canvas/40 p-3.5">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 font-mono text-lg font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

export function MonthSummary({ state }: { state: SectionState<SummaryResult> }) {
  const { formatMoney } = useFormatters();
  return (
    <DashboardCard title="This month">
      {state.loading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[68px]" />
          ))}
        </div>
      ) : state.error ? (
        <SectionError message={state.error} />
      ) : state.data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Income" value={formatMoney(state.data.totalIncome, state.data.currency)} tone="success" />
          <Stat label="Expenses" value={formatMoney(state.data.totalExpenses, state.data.currency)} tone="danger" />
          <Stat
            label="Net savings"
            value={formatMoney(state.data.netSavings, state.data.currency)}
            tone={Number(state.data.netSavings) < 0 ? 'danger' : 'success'}
          />
          <Stat label="Savings rate" value={`${state.data.savingsRate}%`} />
        </div>
      ) : null}
    </DashboardCard>
  );
}
