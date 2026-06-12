'use client';
import { useEffect, useState } from 'react';
import type { StreakLeader, StreakLeaderboards } from '@finby/shared';
import { api } from '../lib/api';
import { useAuthStore } from '../lib/auth-store';
import { AdminShell } from './AdminShell';
import { Button } from './ui/button';

const MEDALS = ['🥇', '🥈', '🥉'] as const;

function Rank({ rank }: { rank: number }) {
  if (rank <= 3) {
    return (
      <span className="w-8 shrink-0 text-center text-lg" aria-label={`Rank ${rank}`}>
        {MEDALS[rank - 1]}
      </span>
    );
  }
  return (
    <span className="w-8 shrink-0 text-center font-mono text-sm tabular-nums text-faint">
      #{rank}
    </span>
  );
}

function Row({ leader, metric }: { leader: StreakLeader; metric: 'current' | 'longest' }) {
  const primary = metric === 'current' ? leader.currentStreak : leader.longestStreak;
  const secondaryLabel = metric === 'current' ? 'best' : 'now';
  const secondary = metric === 'current' ? leader.longestStreak : leader.currentStreak;

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Rank rank={leader.rank} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">{leader.displayName}</p>
        <p className="truncate text-xs text-faint">{leader.email}</p>
      </div>
      <div className="shrink-0 text-right">
        <span className="font-display text-lg leading-none text-ink tabular-nums">{primary}</span>
        <span className="ml-1 text-xs text-faint">days</span>
        <p className="text-xs text-faint">
          {secondaryLabel} {secondary}
        </p>
      </div>
    </li>
  );
}

function Board({
  title,
  emoji,
  leaders,
  metric,
}: {
  title: string;
  emoji: string;
  leaders: StreakLeader[];
  metric: 'current' | 'longest';
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <h2 className="flex items-center gap-2 border-b border-line px-4 py-3.5 font-display text-sm font-semibold uppercase tracking-wide text-muted">
        <span aria-hidden="true">{emoji}</span>
        {title}
      </h2>
      {leaders.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted">No streak data yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {leaders.slice(0, 25).map((leader) => (
            <Row key={`${metric}-${leader.rank}-${leader.email}`} leader={leader} metric={metric} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function StreakLeaderboard() {
  const setToken = useAuthStore((s) => s.setToken);
  const [data, setData] = useState<StreakLeaderboards | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    api
      .streaks()
      .then(setData)
      .catch(() => setErr(true));
  }, []);

  if (err)
    return (
      <AdminShell>
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-line bg-surface p-8 shadow-card">
          <p className="text-ink">Failed to load streaks.</p>
          <Button variant="ghost" onClick={() => setToken(null)}>
            Sign out
          </Button>
        </div>
      </AdminShell>
    );
  if (!data)
    return (
      <AdminShell>
        <div className="py-24 text-center text-muted">Loading…</div>
      </AdminShell>
    );

  return (
    <AdminShell>
      <div className="space-y-3">
        <h1 className="font-display text-xl font-bold tracking-tight text-ink">Streak leaderboards</h1>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Board title="Current streak" emoji="🔥" leaders={data.current} metric="current" />
          <Board title="All-time best" emoji="🏆" leaders={data.longest} metric="longest" />
        </div>
      </div>
    </AdminShell>
  );
}
