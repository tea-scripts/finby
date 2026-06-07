'use client';

import { Skeleton } from '@/components/ui/skeleton';
import type { SectionState } from '@/lib/dashboard-api';
import { useFormatters } from '@/lib/use-formatters';
import type { AccountView } from '@/lib/types';
import { DashboardCard, SectionEmpty, SectionError } from './dashboard-card';

export function AccountList({ state }: { state: SectionState<AccountView[]> }) {
  const { formatMoney } = useFormatters();
  const accounts = state.data?.filter((a) => !a.isArchived) ?? [];
  return (
    <DashboardCard title="Accounts">
      {state.loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : state.error ? (
        <SectionError message={state.error} />
      ) : accounts.length === 0 ? (
        <SectionEmpty message="No accounts yet." />
      ) : (
        <div className="divide-y divide-line">
          {accounts.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm text-ink">{a.name}</p>
                <p className="text-xs text-faint">{a.accountType}</p>
              </div>
              <span className="shrink-0 font-mono text-sm text-ink">{formatMoney(a.balance, a.currency)}</span>
            </div>
          ))}
        </div>
      )}
    </DashboardCard>
  );
}
