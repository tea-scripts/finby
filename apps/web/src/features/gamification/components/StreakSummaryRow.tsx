'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getStreakStatus } from '@/lib/streaks-api';
import { getXpSummary } from '@/lib/gamification-api';
import { Skeleton } from '@/components/ui/skeleton';

/** Compact Settings row: current streak + XP balance + a link to the full
 *  progress page. Replaces the old inline streak + calendar block. */
export function StreakSummaryRow({ workspaceId }: { workspaceId: string }) {
  const [streak, setStreak] = useState<number | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([getStreakStatus(workspaceId), getXpSummary(workspaceId)])
      .then(([s, x]) => {
        if (!active) return;
        setStreak(s.currentStreak);
        setBalance(x.balance);
      })
      .catch(() => {
        if (active) {
          setStreak(0);
          setBalance(0);
        }
      });
    return () => {
      active = false;
    };
  }, [workspaceId]);

  if (streak === null || balance === null) {
    return (
      <div className="border-t border-line pt-4">
        <Skeleton className="h-5 w-64" />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-4 text-sm">
      <span className="text-ink">🔥 {streak}-day streak</span>
      <span className="text-faint">·</span>
      <span className="text-ink">⚡ {balance} XP</span>
      <span className="text-faint">·</span>
      <Link href="/streaks" className="font-medium text-accent transition hover:text-accent-hover">
        View progress →
      </Link>
    </div>
  );
}
