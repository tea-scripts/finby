'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { InstallSheet } from '@/components/app/install-sheet';
import { enablePush } from '@/lib/push';
import { detectIosSafariTab } from '@/lib/ios';
import { useAuth } from '@/lib/store';
import { STREAK_START_SHOWN_KEY } from '@/lib/streak-start';

/** One-time "you started a streak — turn on reminders" prompt. Push-capable
 *  browsers get a one-tap enable; iOS Safari tabs (no programmatic push) get the
 *  guided Add-to-Home-Screen sheet instead. Visibility/eligibility is decided by
 *  the caller (see shouldPromptStreakStart); this component just renders + records
 *  that it was shown. */
export function StreakStartPrompt({
  open,
  onClose,
  streak,
}: {
  open: boolean;
  onClose: () => void;
  streak: number;
}) {
  const workspaceId = useAuth((s) => s.workspace?.id);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const isIos = detectIosSafariTab();

  function markShown() {
    try {
      localStorage.setItem(STREAK_START_SHOWN_KEY, '1');
    } catch {
      /* private mode / storage disabled — non-fatal */
    }
  }

  function dismiss() {
    markShown();
    onClose();
  }

  async function onEnable() {
    if (!workspaceId) return;
    setBusy(true);
    try {
      await enablePush(workspaceId);
    } finally {
      markShown();
      setBusy(false);
      onClose();
    }
  }

  if (!open) return null;

  return (
    <>
      <Modal open={open} onClose={dismiss} title="🔥 You started a streak!">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            That&apos;s day {streak}. Turn on reminders so a gentle nudge keeps your streak alive —
            it only takes a tap a day.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={dismiss}>
              Not now
            </Button>
            {isIos ? (
              <Button variant="primary" onClick={() => setSheetOpen(true)}>
                Install Finby
              </Button>
            ) : (
              <Button variant="primary" loading={busy} onClick={onEnable}>
                Enable reminders
              </Button>
            )}
          </div>
        </div>
      </Modal>

      <InstallSheet
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          dismiss();
        }}
      />
    </>
  );
}
