'use client';

import { Skeleton } from '@/components/ui/skeleton';
import type { SectionState } from '@/lib/dashboard-api';
import type { Transaction } from '@/lib/types';
import { useFormatters } from '@/lib/use-formatters';
import { DashboardCard, SectionEmpty, SectionError } from './dashboard-card';

function amountTone(type: string): string {
  if (type === 'INCOME') return 'text-success';
  if (type === 'EXPENSE') return 'text-danger';
  return 'text-muted';
}
function amountSign(type: string): string {
  if (type === 'INCOME') return '+';
  if (type === 'EXPENSE') return '−';
  return '';
}

function Row({ tx }: { tx: Transaction }) {
  const { formatDate, formatMoney } = useFormatters();
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm text-ink">{tx.merchant ?? tx.description ?? 'Transaction'}</p>
        <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
          <span>{formatDate(tx.transactionDate)}</span>
          {tx.category && (
            <span className="rounded-md border border-line bg-canvas/60 px-1.5 py-0.5 text-faint">
              {tx.category.name}
            </span>
          )}
        </p>
      </div>
      <span className={`shrink-0 font-mono text-sm ${amountTone(tx.type)}`}>
        {amountSign(tx.type)}
        {formatMoney(tx.amountOriginal, tx.currencyOriginal)}
      </span>
    </div>
  );
}

export function RecentTransactions({ state }: { state: SectionState<Transaction[]> }) {
  return (
    <DashboardCard title="Recent transactions" action={{ href: '/transactions', label: 'View all' }}>
      {state.loading ? (
        <div className="space-y-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : state.error ? (
        <SectionError message={state.error} />
      ) : !state.data || state.data.length === 0 ? (
        <SectionEmpty message="No transactions yet. Tell Finby what you spent." />
      ) : (
        <div className="divide-y divide-line">
          {state.data.map((tx) => (
            <Row key={tx.id} tx={tx} />
          ))}
        </div>
      )}
    </DashboardCard>
  );
}
