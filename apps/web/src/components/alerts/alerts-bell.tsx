'use client';

import { useEffect } from 'react';
import { Bell } from '@phosphor-icons/react';
import { listAlerts } from '@/lib/alerts-api';
import { useAlertsStore } from '@/lib/alerts-store';

/** Header bell that opens the alerts drawer and shows an unread-count badge. */
export function AlertsBell({ workspaceId }: { workspaceId: string }) {
  const unreadCount = useAlertsStore((s) => s.unreadCount);
  const setOpen = useAlertsStore((s) => s.setOpen);

  // Lightweight unread-count fetch (limit=1, we only read res.unreadCount).
  // Silent on failure — a badge error must never break the header.
  useEffect(() => {
    listAlerts(workspaceId, { limit: 1 })
      .then((res) => useAlertsStore.setState({ unreadCount: res.unreadCount }))
      .catch(() => undefined);
  }, [workspaceId]);

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="relative rounded-xl p-2 text-muted transition-colors hover:bg-white/5 hover:text-ink"
      aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
    >
      <Bell size={20} weight={unreadCount > 0 ? 'fill' : 'regular'} aria-hidden="true" />
      {unreadCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-white">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}
