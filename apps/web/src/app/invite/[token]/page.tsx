'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthShell } from '@/components/auth/auth-shell';
import { useAuth } from '@/lib/store';
import { acceptInvite, acceptInviteSignup, previewInvite } from '@/lib/members-api';
import type { InvitePreview } from '@/lib/types';

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const status = useAuth((s) => s.status);

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    previewInvite(token)
      .then(setPreview)
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Invalid invitation.'));
  }, [token]);

  async function onAcceptExisting() {
    setBusy(true);
    setActionError(null);
    try {
      await acceptInvite(token);
      await useAuth.getState().fetchWorkspaces();
      router.push('/settings');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not accept the invitation.');
    } finally {
      setBusy(false);
    }
  }

  async function onAcceptSignup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setActionError(null);
    try {
      const result = await acceptInviteSignup(token, { displayName: displayName.trim(), password });
      useAuth.setState({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
        workspace: result.workspace,
        activeWorkspaceId: result.workspace.id,
        status: 'authed',
      });
      await useAuth.getState().fetchWorkspaces();
      router.push('/dashboard');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not create your account.');
    } finally {
      setBusy(false);
    }
  }

  const stateMessage = (msg: string) => (
    <AuthShell title="Invitation" subtitle={msg} footer={null}>
      {null}
    </AuthShell>
  );

  if (loadError) return stateMessage(loadError);
  if (!preview) return stateMessage('Loading invitation…');

  if (preview.state !== 'valid') {
    const msg =
      preview.state === 'expired'
        ? 'This invitation has expired.'
        : preview.state === 'revoked'
          ? 'This invitation was cancelled.'
          : 'This invitation has already been accepted.';
    return stateMessage(msg);
  }

  const roleLabel = preview.role === 'CO_MANAGER' ? 'co-manager' : 'viewer';

  return (
    <AuthShell
      title={`Join ${preview.workspaceName}`}
      subtitle={`You were invited as a ${roleLabel} (${preview.email}).`}
      footer={
        status === 'authed' ? null : (
          <>
            Already have an account?{' '}
            {/* NOTE: login page does not currently honour ?next= — follow-up to add */}
            <Link
              href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
              className="font-medium text-accent hover:text-accent-hover"
            >
              Log in
            </Link>{' '}
            to accept.
          </>
        )
      }
    >
      <div className="space-y-4">
        {actionError && (
          <div className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
            {actionError}
          </div>
        )}

        {status === 'authed' ? (
          <button
            type="button"
            disabled={busy}
            onClick={onAcceptExisting}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Accepting…' : 'Accept invitation'}
          </button>
        ) : (
          <form onSubmit={onAcceptSignup} className="space-y-3" noValidate>
            <input
              value={preview.email}
              disabled
              className="w-full rounded-lg border border-line bg-surface/40 px-3 py-2.5 text-sm text-muted"
            />
            <input
              type="text"
              required
              placeholder="Your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink"
            />
            <input
              type="password"
              required
              minLength={8}
              placeholder="Create a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? 'Creating account…' : 'Create account & join'}
            </button>
          </form>
        )}
      </div>
    </AuthShell>
  );
}
