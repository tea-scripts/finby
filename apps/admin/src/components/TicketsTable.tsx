'use client';
import { Fragment, useEffect, useState } from 'react';
import {
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABELS,
  type AdminSupportTicket,
} from '@finby/shared';
import { api } from '../lib/api';
import { useAuthStore } from '../lib/auth-store';
import { AdminShell } from './AdminShell';
import { Button } from './ui/button';
import { Dropdown } from './ui/dropdown';

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 text-muted transition-transform ${open ? 'rotate-90' : ''}`}
    >
      <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  ...SUPPORT_STATUSES.map((s) => ({ value: s, label: SUPPORT_STATUS_LABELS[s] })),
];
const STATUS_OPTIONS = SUPPORT_STATUSES.map((s) => ({ value: s, label: SUPPORT_STATUS_LABELS[s] }));
const HEADERS = ['Submitter', 'Category', 'Subject', 'Status', 'Submitted'] as const;

export function TicketsTable() {
  const setToken = useAuthStore((s) => s.setToken);
  const [tickets, setTickets] = useState<AdminSupportTicket[] | null>(null);
  const [err, setErr] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    api
      .tickets(statusFilter)
      .then((d) => {
        if (!stale) {
          setTickets(d.tickets);
          setErr(false);
        }
      })
      .catch(() => {
        if (!stale) setErr(true);
      });
    return () => {
      stale = true;
    };
  }, [statusFilter]);

  async function changeStatus(id: string, status: string): Promise<void> {
    try {
      const updated = await api.updateTicket(id, status);
      setTickets((prev) => (prev ? prev.map((t) => (t.id === id ? updated : t)) : prev));
    } catch {
      setErr(true);
    }
  }

  if (err)
    return (
      <AdminShell>
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-line bg-surface p-8 shadow-card">
          <p className="text-ink">Failed to load tickets.</p>
          <Button variant="ghost" onClick={() => setToken(null)}>
            Sign out
          </Button>
        </div>
      </AdminShell>
    );
  if (!tickets)
    return (
      <AdminShell>
        <div className="py-24 text-center text-muted">Loading…</div>
      </AdminShell>
    );

  return (
    <AdminShell>
      <div className="space-y-4">
        <h1 className="font-display text-xl font-bold tracking-tight text-ink">Support tickets</h1>

        <Dropdown
          aria-label="Filter by status"
          className="w-44"
          value={statusFilter}
          options={FILTER_OPTIONS}
          onChange={setStatusFilter}
        />

        <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line">
                {HEADERS.map((h) => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tickets.map((t) => {
                const expanded = expandedId === t.id;
                return (
                  <Fragment key={t.id}>
                    <tr
                      tabIndex={0}
                      aria-expanded={expanded}
                      onClick={() => setExpandedId((id) => (id === t.id ? null : t.id))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setExpandedId((id) => (id === t.id ? null : t.id));
                        }
                      }}
                      className="cursor-pointer outline-none transition hover:bg-canvas/40 focus-visible:bg-canvas/40"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">{t.user.displayName}</p>
                        <p className="truncate text-xs text-faint">{t.user.email}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted">{SUPPORT_CATEGORY_LABELS[t.category]}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Chevron open={expanded} />
                          <p className="text-sm text-ink">{t.subject}</p>
                        </div>
                        {!expanded && <p className="max-w-md truncate pl-6 text-xs text-faint">{t.message}</p>}
                      </td>
                      {/* Status control is interactive — don't toggle the row when using it. */}
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <Dropdown
                          aria-label={`Status for ${t.subject}`}
                          className="w-40"
                          value={t.status}
                          options={STATUS_OPTIONS}
                          onChange={(v) => changeStatus(t.id, v)}
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-muted">{shortDate(t.createdAt)}</td>
                    </tr>
                    {expanded && (
                      <tr className="bg-canvas/40">
                        <td colSpan={HEADERS.length} className="px-4 pb-4 pt-0">
                          <div className="rounded-xl border border-line bg-surface p-4">
                            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Message</p>
                            <p className="whitespace-pre-wrap break-words text-sm text-ink">{t.message}</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {tickets.length === 0 ? (
          <p className="py-12 text-center text-muted">No tickets.</p>
        ) : null}
      </div>
    </AdminShell>
  );
}
