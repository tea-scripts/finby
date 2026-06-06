'use client';

import { useState } from 'react';
import { resendVerification } from '@/lib/auth-api';
import { useAuth } from '@/lib/store';

/** Soft-nag bar shown to logged-in users whose email isn't verified.
 *  Dismissible for the session; never blocks anything. */
export function VerifyEmailBanner() {
  const user = useAuth((s) => s.user);
  const [dismissed, setDismissed] = useState(false);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  if (!user || user.emailVerified || dismissed) return null;

  async function resend() {
    setSending(true);
    try {
      await resendVerification();
      setSent(true);
    } catch {
      /* ignore — keep the banner */
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex items-center gap-3 border-b border-warn/30 bg-warn/10 px-4 py-2 text-xs text-warn">
      <p className="flex-1">
        {sent ? 'Verification email sent — check your inbox.' : 'Verify your email to secure your account.'}
      </p>
      {!sent && (
        <button onClick={resend} disabled={sending} className="shrink-0 font-semibold underline disabled:opacity-50">
          {sending ? 'Sending…' : 'Resend'}
        </button>
      )}
      <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="shrink-0 text-warn/70 hover:text-warn">
        ✕
      </button>
    </div>
  );
}
