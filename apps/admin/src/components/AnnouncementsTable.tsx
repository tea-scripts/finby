'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminAnnouncement, AdminAnnouncementInput, LottieAsset } from '@finby/shared';
import { api } from '../lib/api';
import { AdminShell } from './AdminShell';
import { AnnouncementForm } from './AnnouncementForm';
import { Button } from './ui/button';
import { Modal } from './ui/modal';

const HEADERS = ['Title', 'Status', 'Tier', 'Order', 'Engagement', ''] as const;

function StatusPill({ status }: { status: AdminAnnouncement['status'] }) {
  const published = status === 'PUBLISHED';
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${published ? 'bg-accent-soft text-accent' : 'bg-line text-muted'}`}
    >
      {published ? 'Published' : 'Draft'}
    </span>
  );
}

export function AnnouncementsTable() {
  const [rows, setRows] = useState<AdminAnnouncement[] | null>(null);
  const [assets, setAssets] = useState<LottieAsset[]>([]);
  const [err, setErr] = useState(false);
  const [editing, setEditing] = useState<AdminAnnouncement | null>(null);
  const [creating, setCreating] = useState(false);

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

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this announcement? This cannot be undone.')) return;
    await api.deleteAnnouncement(id);
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

  return (
    <AdminShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-display text-xl font-bold tracking-tight text-ink">Announcements</h1>
          <Button onClick={() => setCreating(true)}>New announcement</Button>
        </div>

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
                {rows.map((a) => (
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
                        <Button
                          variant="ghost"
                          className="px-3 py-1.5"
                          onClick={() => handleDelete(a.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rows !== null && rows.length === 0 && (
          <p className="py-12 text-center text-muted">No announcements yet.</p>
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
    </AdminShell>
  );
}
