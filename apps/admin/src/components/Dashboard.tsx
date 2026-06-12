'use client';
import { useEffect, useState } from 'react';
import type { EngagementMetrics, GrowthMetrics, OpsMetrics, RevenueMetrics } from '@finby/shared';
import { api } from '../lib/api';
import { useAuthStore } from '../lib/auth-store';
import { AdminShell } from './AdminShell';
import { StatCard } from './StatCard';
import { MetricChart } from './MetricChart';
import { Button } from './ui/button';

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
      {children}
    </h2>
  );
}

export function Dashboard() {
  const setToken = useAuthStore((s) => s.setToken);
  const [growth, setGrowth] = useState<GrowthMetrics | null>(null);
  const [eng, setEng] = useState<EngagementMetrics | null>(null);
  const [rev, setRev] = useState<RevenueMetrics | null>(null);
  const [ops, setOps] = useState<OpsMetrics | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    Promise.all([api.growth(), api.engagement(), api.revenue(), api.ops()])
      .then(([g, e, r, o]) => { setGrowth(g); setEng(e); setRev(r); setOps(o); })
      .catch(() => setErr(true));
  }, []);

  if (err)
    return (
      <AdminShell>
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-line bg-surface p-8 shadow-card">
          <p className="text-ink">Failed to load metrics.</p>
          <Button variant="ghost" onClick={() => setToken(null)}>
            Sign out
          </Button>
        </div>
      </AdminShell>
    );
  if (!growth || !eng || !rev || !ops)
    return (
      <AdminShell>
        <div className="py-24 text-center text-muted">Loading…</div>
      </AdminShell>
    );

  const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <AdminShell>
      <div className="space-y-8">
      <section className="space-y-3">
        <SectionHeading>Growth &amp; Users</SectionHeading>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Total users" value={growth.totalUsers} />
          <StatCard label="Workspaces" value={growth.totalWorkspaces} />
          <StatCard label="DAU / WAU / MAU" value={`${growth.dau}/${growth.wau}/${growth.mau}`} />
          <StatCard label="Paid workspaces" value={growth.tierSplit.paid} />
        </div>
        <MetricChart title="New signups / day" data={growth.signups} />
      </section>

      <section className="space-y-3">
        <SectionHeading>Engagement</SectionHeading>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Transactions" value={eng.totalTransactions} />
          <StatCard label="Avg txn / active user" value={eng.avgTransactionsPerActiveUser} />
          <StatCard label="Conversations" value={eng.conversations} />
          <StatCard label="Chat messages" value={eng.chatMessages} />
        </div>
        <MetricChart title="Transactions / day" data={eng.transactionsPerDay} />
      </section>

      <section className="space-y-3">
        <SectionHeading>Revenue</SectionHeading>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="MRR" value={usd(rev.mrrMinor)} />
          <StatCard label="Trials" value={rev.trials} />
          <StatCard label="Paid (by tier)" value={rev.paidByTier.reduce((s, t) => s + t.count, 0)} />
          <StatCard label="Past due" value={ops.pastDueSubscriptions} />
        </div>
        <MetricChart title="New paid subs / day" data={rev.newPaidPerDay} />
      </section>

      <section className="space-y-3">
        <SectionHeading>Operational</SectionHeading>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Feedback count" value={ops.feedbackTotal} />
          <StatCard label="Avg rating" value={ops.feedbackAvgRating ?? '—'} />
          <StatCard label="Past-due subs" value={ops.pastDueSubscriptions} />
          <StatCard label="Errors / cost" value={ops.sentryUrl ? 'Sentry ↗' : '—'} />
        </div>
        {ops.sentryUrl && (
          <a className="inline-block text-sm text-accent hover:text-accent-hover" href={ops.sentryUrl} target="_blank" rel="noreferrer">
            Open Sentry for error rates &amp; LLM cost
          </a>
        )}
      </section>
      </div>
    </AdminShell>
  );
}
