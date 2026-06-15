'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/store';
import { toast } from '@/lib/toast';
import { Dropdown } from '@/components/ui/dropdown';
import {
  changeMemberRole, cancelInvite, inviteMember, leaveWorkspace,
  listInvites, listMembers, removeMember, resendInvite,
} from '@/lib/members-api';
import type { InviteView, MemberView, WorkspaceMemberRole } from '@/lib/types';

const ROLE_OPTIONS = [
  { value: 'VIEWER', label: 'Viewer' },
  { value: 'CO_MANAGER', label: 'Co-manager' },
];

export function MembersSection() {
  const workspace = useAuth((s) => s.workspace);
  const workspaces = useAuth((s) => s.workspaces);
  const activeId = useAuth((s) => s.activeWorkspaceId);
  const fetchWorkspaces = useAuth((s) => s.fetchWorkspaces);
  const setActiveWorkspace = useAuth((s) => s.setActiveWorkspace);
  const myRole = workspaces.find((w) => w.workspaceId === activeId)?.role ?? 'VIEWER';
  const isOwner = myRole === 'OWNER';

  const [members, setMembers] = useState<MemberView[]>([]);
  const [invites, setInvites] = useState<InviteView[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Exclude<WorkspaceMemberRole, 'OWNER'>>('VIEWER');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const wsId = workspace?.id;

  async function refresh() {
    if (!wsId) return;
    // Guard the initial load: a transient API failure (deploy window, network
    // blip) must surface as an error state, not an uncaught promise rejection.
    try {
      setMembers(await listMembers(wsId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load members.');
    }
    if (isOwner) {
      try { setInvites(await listInvites(wsId)); } catch { /* non-owner */ }
    }
  }

  useEffect(() => {
    void refresh();
    // Re-run when isOwner flips true: `workspaces` (and thus the derived role)
    // loads async via the header's fetchWorkspaces, so an owner who lands here
    // first would otherwise never fetch pending invites. refresh closure omitted.
  }, [wsId, isOwner]);

  // Only render for Family workspaces.
  if (!workspace || workspace.tier !== 'FAMILY') return null;

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!wsId) return;
    setBusy(true); setError(null);
    try {
      await inviteMember(wsId, email.trim(), role);
      setEmail('');
      await refresh();
      toast.success('Invite sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send invite.');
      toast.error('Could not send invite', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<unknown>, successMessage?: string) {
    setBusy(true); setError(null);
    try {
      await fn();
      await refresh();
      if (successMessage) toast.success(successMessage);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Action failed.';
      setError(msg);
      toast.error('Action failed', msg);
    } finally { setBusy(false); }
  }

  // Leaving is special: don't refresh() the workspace you just left (it would 404).
  // Refresh the membership list and switch the active workspace to a remaining one,
  // which unmounts this Family-only section.
  async function onLeave() {
    if (!wsId) return;
    setBusy(true); setError(null);
    try {
      await leaveWorkspace(wsId);
      await fetchWorkspaces();
      const remaining = useAuth.getState().workspaces.find((w) => w.workspaceId !== wsId);
      if (remaining) setActiveWorkspace(remaining.workspaceId);
      toast.success('You left the family');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not leave this family.');
      toast.error('Could not leave', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
        Family members
      </h2>
      <div className="rounded-2xl border border-line bg-surface/60 p-5 shadow-card space-y-4">
        {error && <p className="text-sm text-red-400">{error}</p>}

        <ul className="divide-y divide-line">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-sm font-medium text-ink">
                  {m.displayName}{m.isSelf ? ' (you)' : ''}
                </p>
                <p className="text-xs text-muted">{m.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {isOwner && m.role !== 'OWNER' ? (
                  <Dropdown
                    value={m.role}
                    disabled={busy}
                    onChange={(v) => act(() => changeMemberRole(wsId!, m.id, v as WorkspaceMemberRole), 'Role updated')}
                    options={ROLE_OPTIONS}
                    aria-label={`Role for ${m.displayName}`}
                    className="w-36"
                  />
                ) : (
                  <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-medium text-accent">
                    {m.role === 'OWNER' ? 'Owner' : m.role === 'CO_MANAGER' ? 'Co-manager' : 'Viewer'}
                  </span>
                )}
                {isOwner && m.role !== 'OWNER' && (
                  <button
                    type="button" disabled={busy}
                    onClick={() => act(() => removeMember(wsId!, m.id), 'Member removed')}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>

        {isOwner && (
          <form onSubmit={onInvite} className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <input
              type="email" required value={email} disabled={busy}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@email.com"
              className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
            />
            <Dropdown
              value={role}
              disabled={busy}
              onChange={(v) => setRole(v as Exclude<WorkspaceMemberRole, 'OWNER'>)}
              options={ROLE_OPTIONS}
              aria-label="Invite role"
              className="w-36"
            />
            <button
              type="submit" disabled={busy || !email.trim()}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Invite
            </button>
          </form>
        )}

        {isOwner && invites.length > 0 && (
          <div className="border-t border-line pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Pending invites</p>
            <ul className="divide-y divide-line">
              {invites.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between py-2">
                  <span className="text-sm text-ink">{inv.email}</span>
                  <div className="flex items-center gap-3">
                    <button type="button" disabled={busy} onClick={() => act(() => resendInvite(wsId!, inv.id), 'Invite resent')} className="text-xs text-accent hover:text-accent-hover">Resend</button>
                    <button type="button" disabled={busy} onClick={() => act(() => cancelInvite(wsId!, inv.id), 'Invite canceled')} className="text-xs text-red-400 hover:text-red-300">Cancel</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!isOwner && (
          <button
            type="button" disabled={busy}
            onClick={onLeave}
            className="text-sm text-red-400 hover:text-red-300"
          >
            Leave this family
          </button>
        )}
      </div>
    </section>
  );
}
