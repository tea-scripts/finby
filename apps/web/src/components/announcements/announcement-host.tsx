'use client';

import { useState } from 'react';
import { ANNOUNCEMENTS, pickAnnouncement } from '@/lib/announcements';
import { enablePush } from '@/lib/push';
import { updateProfile } from '@/lib/settings-api';
import { useAuth } from '@/lib/store';
import { AnnouncementModal } from './announcement-modal';

/** Mounted once in the authed shell. Surfaces the first active, undismissed
 *  announcement and wires its actions:
 *   - primary 'dismiss'      → persist dismissal (never show again)
 *   - primary 'enable-push'  → run the permission prompt, then persist dismissal
 *   - "Remind me later"      → close for this session only (reappears next load) */
export function AnnouncementHost() {
  const user = useAuth((s) => s.user);
  const workspace = useAuth((s) => s.workspace);
  const setUser = useAuth((s) => s.setUser);

  const [remindLater, setRemindLater] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const dismissed = user?.preferences.dismissedAnnouncements ?? [];
  const picked = pickAnnouncement(ANNOUNCEMENTS, [...dismissed, ...remindLater], new Date());
  if (!user || !picked) return null;
  const announcement = picked; // non-null in the closures below

  async function persistDismiss(id: string) {
    const next = [...dismissed, id];
    try {
      const updated = await updateProfile({ preferences: { dismissedAnnouncements: next } });
      setUser(updated);
    } catch {
      // Persist failed — close for this session so the user isn't trapped.
      setRemindLater((r) => [...r, id]);
    }
  }

  async function handlePrimary() {
    if (announcement.primary.kind === 'enable-push' && workspace) {
      setBusy(true);
      try {
        await enablePush(workspace.id);
      } catch {
        /* ignore — still dismiss so we don't keep nagging */
      } finally {
        setBusy(false);
      }
    }
    await persistDismiss(announcement.id);
  }

  function handleRemindLater() {
    setRemindLater((r) => [...r, announcement.id]);
  }

  return (
    <AnnouncementModal
      announcement={announcement}
      onPrimary={handlePrimary}
      onRemindLater={handleRemindLater}
      busy={busy}
    />
  );
}
