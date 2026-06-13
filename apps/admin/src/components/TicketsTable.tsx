'use client';
import { useEffect, useState } from 'react';
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
              {tickets.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{t.user.displayName}</p>
                    <p className="truncate text-xs text-faint">{t.user.email}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted">{SUPPORT_CATEGORY_LABELS[t.category]}</td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-ink">{t.subject}</p>
                    <p className="max-w-md truncate text-xs text-faint">{t.message}</p>
                  </td>
                  <td className="px-4 py-3">
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
              ))}
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
