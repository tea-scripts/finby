'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthShell } from '@/components/auth/auth-shell';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { PasswordStrength } from '@/components/ui/password-strength';
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
  const [joining, setJoining] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    previewInvite(token)
      .then(setPreview)
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Invalid invitation.'));
  }, [token]);

  async function onAcceptExisting() {
    setBusy(true);
    setJoining(true);
    setActionError(null);
    try {
      await acceptInvite(token);
      await useAuth.getState().fetchWorkspaces();
      router.push('/settings');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not accept the invitation.');
      setJoining(false);
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
      // Switch to the "joining" view BEFORE authenticating, so the logged-in
      // "Accept invitation" branch never flashes between auth + redirect.
      setJoining(true);
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

  // Accept/signup in flight (and redirecting): show a clean transition instead of
  // briefly flashing the logged-in "Accept invitation" branch post-signup.
  if (joining) return stateMessage(`Joining ${preview.workspaceName}…`);

  const roleLabel = preview.role === 'CO_MANAGER' ? 'co-manager' : 'viewer';
  const loginHref = `/login?next=${encodeURIComponent(`/invite/${token}`)}`;

  return (
    <AuthShell
      title={`Join ${preview.workspaceName}`}
      subtitle={`You were invited as a ${roleLabel} (${preview.email}).`}
      footer={
        status === 'authed' || preview.hasAccount ? null : (
          <>
            Already have an account?{' '}
            <Link href={loginHref} className="font-medium text-accent hover:text-accent-hover">
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
        ) : preview.hasAccount ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              You already have a Finby account for{' '}
              <span className="text-ink">{preview.email}</span>. Log in to accept this invitation.
            </p>
            <Link
              href={loginHref}
              className="block w-full rounded-lg bg-accent px-4 py-2.5 text-center text-sm font-medium text-white"
            >
              Log in to accept
            </Link>
          </div>
        ) : (
          <form onSubmit={onAcceptSignup} className="space-y-3" noValidate>
            <Input
              value={preview.email}
              disabled
              aria-label="Invited email"
              className="opacity-70"
            />
            <Input
              type="text"
              required
              placeholder="Your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <div>
              <PasswordInput
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Create a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <PasswordStrength value={password} />
            </div>
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
