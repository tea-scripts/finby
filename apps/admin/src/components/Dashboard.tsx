'use client';
import { useEffect, useState } from 'react';
import type { EngagementMetrics, GrowthMetrics, OpsMetrics, RevenueMetrics } from '@finby/shared';
import { api } from '../lib/api';
import { useAuthStore } from '../lib/auth-store';
import { StatCard } from './StatCard';
import { MetricChart } from './MetricChart';

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

  if (err) return <div className="p-8">Failed to load metrics. <button className="underline" onClick={() => setToken(null)}>Sign out</button></div>;
  if (!growth || !eng || !rev || !ops) return <div className="p-8 text-neutral-500">Loading…</div>;

  const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Finby Analytics</h1>
        <button className="text-sm text-neutral-500 underline" onClick={() => setToken(null)}>Sign out</button>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-600">Growth &amp; Users</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Total users" value={growth.totalUsers} />
          <StatCard label="Workspaces" value={growth.totalWorkspaces} />
          <StatCard label="DAU / WAU / MAU" value={`${growth.dau}/${growth.wau}/${growth.mau}`} />
          <StatCard label="Paid workspaces" value={growth.tierSplit.paid} />
        </div>
        <MetricChart title="New signups / day" data={growth.signups} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-600">Engagement</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Transactions" value={eng.totalTransactions} />
          <StatCard label="Avg txn / active user" value={eng.avgTransactionsPerActiveUser} />
          <StatCard label="Conversations" value={eng.conversations} />
          <StatCard label="Chat messages" value={eng.chatMessages} />
        </div>
        <MetricChart title="Transactions / day" data={eng.transactionsPerDay} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-600">Revenue</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="MRR" value={usd(rev.mrrMinor)} />
          <StatCard label="Trials" value={rev.trials} />
          <StatCard label="Paid (by tier)" value={rev.paidByTier.reduce((s, t) => s + t.count, 0)} />
          <StatCard label="Past due" value={ops.pastDueSubscriptions} />
        </div>
        <MetricChart title="New paid subs / day" data={rev.newPaidPerDay} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-600">Operational</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Feedback count" value={ops.feedbackTotal} />
          <StatCard label="Avg rating" value={ops.feedbackAvgRating ?? '—'} />
          <StatCard label="Past-due subs" value={ops.pastDueSubscriptions} />
          <StatCard label="Errors / cost" value={ops.sentryUrl ? 'Sentry ↗' : '—'} />
        </div>
        {ops.sentryUrl && (
          <a className="inline-block text-sm text-blue-700 underline" href={ops.sentryUrl} target="_blank" rel="noreferrer">
            Open Sentry for error rates &amp; LLM cost
          </a>
        )}
      </section>
    </div>
  );
}
