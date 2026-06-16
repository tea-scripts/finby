'use client';

import { useEffect, useState } from 'react';
import type { Announcement } from '@/lib/announcements';
import { getActiveAnnouncement, markDismissed, markSeen } from '@/lib/announcements-api';
import { enablePush } from '@/lib/push';
import { useAuth } from '@/lib/store';
import { AnnouncementModal } from './announcement-modal';

/** Mounted once in the authed shell. Fetches the single active announcement the
 *  server picks for this user and wires its actions:
 *   - primary 'dismiss'     → persist dismissal (never show again)
 *   - primary 'enable-push' → run the permission prompt, then persist dismissal
 *   - "Remind me later"     → close for this session only (reappears next load) */
export function AnnouncementHost() {
  const workspace = useAuth((s) => s.workspace);

  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stale = false;
    getActiveAnnouncement()
      .then((a) => {
        if (stale || !a) return;
        setAnnouncement(a);
        void markSeen(a.id);
      })
      .catch(() => {
        /* network error — show nothing, never crash the shell */
      });
    return () => {
      stale = true;
    };
  }, []);

  if (!announcement || closed) return null;
  const current = announcement; // non-null in the closures below

  async function handlePrimary() {
    if (current.primary.kind === 'enable-push' && workspace) {
      setBusy(true);
      try {
        await enablePush(workspace.id);
      } catch {
        /* ignore — still dismiss so we don't keep nagging */
      } finally {
        setBusy(false);
      }
    }
    try {
      await markDismissed(current.id);
    } catch {
      /* dismissal persist failed — close locally so the user isn't trapped */
    }
    setClosed(true);
  }

  function handleRemindLater() {
    setClosed(true);
  }

  return (
    <AnnouncementModal
      announcement={current}
      onPrimary={handlePrimary}
      onRemindLater={handleRemindLater}
      busy={busy}
    />
  );
}
