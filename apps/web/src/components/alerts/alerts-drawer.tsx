'use client';

import { useEffect } from 'react';
import {
  Bell,
  CalendarCheck,
  Lightbulb,
  TrendUp,
  Warning,
  X,
  XCircle,
  type Icon,
} from '@phosphor-icons/react';
import { Drawer } from '@/components/ui/drawer';
import { Skeleton } from '@/components/ui/skeleton';
import { listAlerts, markAllAlertsRead, updateAlertStatus } from '@/lib/alerts-api';
import { useAlertsStore } from '@/lib/alerts-store';
import { toast } from '@/lib/toast';
import { useAuth } from '@/lib/store';
import type { AlertView } from '@/lib/types';

const TYPE_ICON: Record<string, { Glyph: Icon; weight: 'regular' | 'fill'; className: string }> = {
  UNUSUAL_SPEND: { Glyph: TrendUp, weight: 'regular', className: 'text-warn' },
  AI_COACHING_NUDGE: { Glyph: Lightbulb, weight: 'fill', className: 'text-accent' },
  MONTHLY_SUMMARY: { Glyph: CalendarCheck, weight: 'regular', className: 'text-success' },
  BUDGET_75_PERCENT: { Glyph: Warning, weight: 'regular', className: 'text-warn' },
  BUDGET_90_PERCENT: { Glyph: Warning, weight: 'fill', className: 'text-warn' },
  BUDGET_EXCEEDED: { Glyph: XCircle, weight: 'fill', className: 'text-danger' },
};
const DEFAULT_ICON = { Glyph: Bell, weight: 'regular' as const, className: 'text-muted' };

/** Relative timestamp via native Date math — no libraries. */
function relativeTime(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function AlertRow({
  alert,
  onRead,
  onDismiss,
}: {
  alert: AlertView;
  onRead: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const { Glyph, weight, className } = TYPE_ICON[alert.type] ?? DEFAULT_ICON;
  const unread = alert.status === 'UNREAD';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => unread && onRead(alert.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (unread) onRead(alert.id);
        }
      }}
      className={`flex items-start gap-3 border-b border-line px-4 py-3.5 text-left transition-colors hover:bg-white/5 ${
        unread ? 'border-l-2 border-l-accent bg-accent-soft' : ''
      }`}
    >
      <Glyph size={18} weight={weight} className={`mt-0.5 shrink-0 ${className}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug text-ink">{alert.title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{alert.body}</p>
        <p className="mt-1 text-[11px] text-faint">{relativeTime(alert.createdAt)}</p>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(alert.id);
        }}
        aria-label="Dismiss"
        className="mt-0.5 shrink-0 rounded-md p-0.5 text-faint transition-colors hover:bg-white/5 hover:text-ink"
      >
        <X size={16} weight="bold" aria-hidden="true" />
      </button>
    </div>
  );
}

function AlertsEmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <Bell size={48} weight="regular" className="text-faint" aria-hidden="true" />
      <p className="text-sm text-muted">You&apos;re all caught up</p>
      <p className="max-w-[200px] text-center text-xs text-faint">
        Finby will notify you about spending insights and budget alerts here.
      </p>
    </div>
  );
}

function AlertsSkeleton() {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3.5">
          <Skeleton className="h-[18px] w-[18px] shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-2.5 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AlertsDrawer() {
  const workspaceId = useAuth((s) => s.workspace?.id);
  const open = useAlertsStore((s) => s.open);
  const setOpen = useAlertsStore((s) => s.setOpen);
  const alerts = useAlertsStore((s) => s.alerts);
  const unreadCount = useAlertsStore((s) => s.unreadCount);
  const loading = useAlertsStore((s) => s.loading);
  const setAlerts = useAlertsStore((s) => s.setAlerts);
  const setLoading = useAlertsStore((s) => s.setLoading);
  const markReadStore = useAlertsStore((s) => s.markRead);
  const markAllReadStore = useAlertsStore((s) => s.markAllRead);
  const dismissStore = useAlertsStore((s) => s.dismiss);
  const decrementUnread = useAlertsStore((s) => s.decrementUnread);

  // Load alerts when the drawer first opens (skip if already loaded this session).
  useEffect(() => {
    if (!open || !workspaceId || alerts.length > 0) return;
    const wsId = workspaceId;
    setLoading(true);
    // The API filters by a single exact status, so fetch UNREAD + READ in
    // parallel and merge — the inbox shows both but never DISMISSED.
    Promise.all([
      listAlerts(wsId, { status: 'UNREAD', limit: 20 }),
      listAlerts(wsId, { status: 'READ', limit: 20 }),
    ])
      .then(([unread, read]) => {
        const merged = [...unread.alerts, ...read.alerts].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        // TODO: proper cursor pagination once the API supports multi-status
        // filtering. For now cap at 20 UNREAD + 20 READ (40 total) and disable
        // "Load more" — merging two independent cursors isn't worth the cost.
        setAlerts(merged, unread.unreadCount, false, null);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
    // Only react to open/workspace changes — not to alerts.length (it mutates here).
  }, [open, workspaceId]);

  if (!workspaceId) return null;
  const wsId = workspaceId;

  async function handleRead(id: string) {
    markReadStore(id);
    decrementUnread();
    try {
      await updateAlertStatus(wsId, id, 'READ');
    } catch {
      /* optimistic — the row stays read locally */
    }
  }

  async function handleDismiss(id: string) {
    dismissStore(id);
    try {
      await updateAlertStatus(wsId, id, 'DISMISSED');
      toast.success('Alert dismissed');
    } catch {
      toast.error("Couldn't dismiss alert", 'Please try again.');
    }
  }

  async function handleMarkAllRead() {
    markAllReadStore();
    try {
      await markAllAlertsRead(wsId);
      toast.success('All notifications marked as read');
    } catch {
      toast.error("Couldn't mark all read", 'Please try again.');
    }
  }

  return (
    <Drawer open={open} onClose={() => setOpen(false)} title="Notifications">
      <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3.5">
        <h2 className="font-display text-base font-semibold text-ink">Notifications</h2>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-xs text-accent transition-colors hover:text-accent-hover"
            >
              Mark all read
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="rounded-lg p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-ink"
          >
            <X size={18} weight="bold" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && alerts.length === 0 ? (
          <AlertsSkeleton />
        ) : alerts.length === 0 ? (
          <AlertsEmptyState />
        ) : (
          <>
            {alerts.map((a) => (
              <AlertRow key={a.id} alert={a} onRead={handleRead} onDismiss={handleDismiss} />
            ))}
          </>
        )}
      </div>
    </Drawer>
  );
}
