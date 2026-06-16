'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminAnnouncement, AdminAnnouncementInput, LottieAsset } from '@finby/shared';
import { api } from '../lib/api';
import { AnnouncementForm } from './AnnouncementForm';
import { Button } from './ui/button';

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
    setEditing(null);
    setCreating(false);
    load();
  }

  if (editing || creating) {
    return (
      <AnnouncementForm
        assets={assets}
        initial={editing ?? undefined}
        onSubmit={handleSubmit}
        onCancel={() => {
          setEditing(null);
          setCreating(false);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold text-ink">Announcements</h1>
        <Button onClick={() => setCreating(true)}>New announcement</Button>
      </div>
      {err && <p className="text-sm text-danger">Failed to load announcements.</p>}
      {rows === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Engagement</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{a.title}</div>
                    <div className="text-xs text-muted">{a.key}</div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={a.status} />
                  </td>
                  <td className="px-4 py-3">{a.targetTier ?? 'Everyone'}</td>
                  <td className="px-4 py-3">{a.order}</td>
                  <td className="px-4 py-3 text-muted">
                    {a.seenCount} seen · {a.dismissedCount} dismissed
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" className="px-2 py-1" onClick={() => setEditing(a)}>
                        Edit
                      </Button>
                      <Button variant="ghost" className="px-2 py-1" onClick={() => handleDelete(a.id)}>
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
    </div>
  );
}
