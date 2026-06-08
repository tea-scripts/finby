'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { TermsContent } from '@/components/legal/terms-content';

/**
 * Consent gate for the register form: the user must open the Terms and scroll to
 * the end before the "I agree" checkbox unlocks, then actively tick it. The
 * parent owns the `accepted` flag and gates form submission on it.
 */
export function TermsGate({
  accepted,
  onAcceptedChange,
}: {
  accepted: boolean;
  onAcceptedChange: (value: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setRead(true);
  }

  // Don't trap the user if the Terms fit without scrolling (e.g. a tall screen).
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el && el.scrollHeight <= el.clientHeight + 8) setRead(true);
  }, [open]);

  return (
    <div className="space-y-1.5">
      <label className="flex items-start gap-2.5 text-sm text-muted">
        <input
          type="checkbox"
          checked={accepted}
          disabled={!read}
          onChange={(e) => onAcceptedChange(e.target.checked)}
          aria-describedby={read ? undefined : 'terms-gate-hint'}
          className="mt-0.5 h-4 w-4 shrink-0 accent-accent disabled:opacity-40"
        />
        <span>
          I agree to the{' '}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="font-medium text-accent underline-offset-2 hover:text-accent-hover hover:underline"
          >
            Terms of Service
          </button>{' '}
          and{' '}
          <Link
            href="/privacy"
            target="_blank"
            className="font-medium text-accent hover:text-accent-hover"
          >
            Privacy Policy
          </Link>
          .
        </span>
      </label>

      {!read && (
        <p id="terms-gate-hint" className="pl-[26px] text-xs text-faint">
          Open and scroll the Terms to the end to continue.
        </p>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Terms of Service">
        <div ref={scrollRef} onScroll={onScroll} className="h-[60vh] overflow-y-auto pr-1">
          <TermsContent />
        </div>
        <Button
          variant="primary"
          disabled={!read}
          onClick={() => setOpen(false)}
          className="mt-4 w-full"
        >
          {read ? "I've read the Terms" : 'Scroll to the bottom to continue'}
        </Button>
      </Modal>
    </div>
  );
}
