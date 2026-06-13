'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Carousel } from '@/components/ui/carousel';
import type { SectionState } from '@/lib/dashboard-api';
import type { AccountView } from '@/lib/types';
import { AccountCard } from './account-card';
import { SectionEmpty, SectionError } from './dashboard-card';

const LEGEND = 'font-display text-xs font-semibold uppercase tracking-wide text-muted';

/** Dashboard accounts view: a swipeable carousel of per-account balance cards. */
export function AccountCarousel({ state }: { state: SectionState<AccountView[]> }) {
  const accounts = state.data?.filter((a) => !a.isArchived) ?? [];

  return (
    <section className="min-w-0 space-y-3">
      <h2 className={LEGEND}>Accounts</h2>
      {state.loading ? (
        <Skeleton className="h-[120px] rounded-2xl" />
      ) : state.error ? (
        <SectionError message={state.error} />
      ) : accounts.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface/60 p-5">
          <SectionEmpty message="No accounts yet." />
        </div>
      ) : accounts.length === 1 ? (
        <AccountCard account={accounts[0]!} />
      ) : (
        <Carousel ariaLabel="Accounts">
          {accounts.map((a) => (
            <AccountCard key={a.id} account={a} />
          ))}
        </Carousel>
      )}
    </section>
  );
}
