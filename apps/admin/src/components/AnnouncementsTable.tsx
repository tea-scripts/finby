'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminAnnouncement, AdminAnnouncementInput, LottieAsset } from '@finby/shared';
import { api } from '../lib/api';
import { AdminShell } from './AdminShell';
import { AnnouncementForm } from './AnnouncementForm';
import { Button } from './ui/button';
import { Dropdown } from './ui/dropdown';
import { Modal } from './ui/modal';

const HEADERS = ['Title', 'Status', 'Tier', 'Order', 'Engagement', ''] as const;

const FILTER_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ARCHIVED', label: 'Archived' },
  { value: 'all', label: 'All' },
];

/** 'active' hides archived (the default); a status value matches exactly; 'all' shows everything. */
function matchesFilter(status: AdminAnnouncement['status'], filter: string): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') return status !== 'ARCHIVED';
  return status === filter;
}

function StatusPill({ status }: { status: AdminAnnouncement['status'] }) {
  const styles: Record<AdminAnnouncement['status'], string> = {
    PUBLISHED: 'bg-accent-soft text-accent',
    DRAFT: 'bg-line text-muted',
    ARCHIVED: 'bg-surface-2 text-faint',
  };
  const labels: Record<AdminAnnouncement['status'], string> = {
    PUBLISHED: 'Published',
    DRAFT: 'Draft',
    ARCHIVED: 'Archived',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

export function AnnouncementsTable() {
  const [rows, setRows] = useState<AdminAnnouncement[] | null>(null);
  const [assets, setAssets] = useState<LottieAsset[]>([]);
  const [err, setErr] = useState(false);
  const [editing, setEditing] = useState<AdminAnnouncement | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState<AdminAnnouncement | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('active');

  const load = useCallback(() => {
    api
      .announcements()
      .then((d) => {
        setRows(d);
        setErr(false);
      })
      .catch(() => setErr(true));
  }, []);

  useEffect(() => {
    load();
    api
      .announcementAssets()
      .then((d) => setAssets(d.lottie))
      .catch(() => undefined);
  }, [load]);

  async function handleArchive() {
    if (!confirmArchive) return;
    setBusy(true);
    try {
      await api.archiveAnnouncement(confirmArchive.id);
      setConfirmArchive(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore(id: string) {
    await api.restoreAnnouncement(id);
    load();
  }

  async function handleSubmit(input: AdminAnnouncementInput) {
    if (editing) await api.updateAnnouncement(editing.id, input);
    else await api.createAnnouncement(input);
    closeForm();
    load();
  }

  function closeForm() {
    setEditing(null);
    setCreating(false);
  }

  const formOpen = creating || editing !== null;
  const visible = (rows ?? []).filter((a) => matchesFilter(a.status, filter));

  return (
    <AdminShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-display text-xl font-bold tracking-tight text-ink">Announcements</h1>
          <Button onClick={() => setCreating(true)}>New announcement</Button>
        </div>

        <Dropdown
          aria-label="Filter by status"
          className="w-44"
          value={filter}
          options={FILTER_OPTIONS}
          onChange={setFilter}
        />

        {err && <p className="text-sm text-danger">Failed to load announcements.</p>}

        {rows === null ? (
          <div className="py-24 text-center text-muted">Loading…</div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-line">
                  {HEADERS.map((h, i) => (
                    <th
                      key={h || `actions-${i}`}
                      className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((a) => (
                  <tr key={a.id} className="transition hover:bg-canvas/40">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{a.title}</p>
                      <p className="truncate text-xs text-faint">{a.key}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={a.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-muted">{a.targetTier ?? 'Everyone'}</td>
                    <td className="px-4 py-3 text-sm text-muted">{a.order}</td>
                    <td className="px-4 py-3 text-sm text-muted">
                      {a.seenCount} seen · {a.dismissedCount} dismissed
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" className="px-3 py-1.5" onClick={() => setEditing(a)}>
                          Edit
                        </Button>
                        {a.status === 'ARCHIVED' ? (
                          <Button
                            variant="ghost"
                            className="px-3 py-1.5"
                            onClick={() => handleRestore(a.id)}
                          >
                            Restore
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            className="px-3 py-1.5"
                            onClick={() => setConfirmArchive(a)}
                          >
                            Archive
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rows !== null && visible.length === 0 && (
          <p className="py-12 text-center text-muted">
            {rows.length === 0
              ? 'No announcements yet.'
              : 'No announcements match this filter.'}
          </p>
        )}
      </div>

      <Modal
        open={formOpen}
        onClose={closeForm}
        title={editing ? 'Edit announcement' : 'New announcement'}
        size="xl"
      >
        {formOpen && (
          <AnnouncementForm
            assets={assets}
            initial={editing ?? undefined}
            onSubmit={handleSubmit}
            onCancel={closeForm}
          />
        )}
      </Modal>

      <Modal
        open={confirmArchive !== null}
        onClose={() => setConfirmArchive(null)}
        title="Archive announcement"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Archive <span className="font-medium text-ink">“{confirmArchive?.title}”</span>? It will
            stop showing to users immediately, but its record and engagement analytics are kept — you
            can restore it as a draft any time.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmArchive(null)}>
              Cancel
            </Button>
            <Button onClick={handleArchive} loading={busy}>
              Archive
            </Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
