import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { InviteView, MemberView, WorkspaceMemberRole } from '@finby/shared';
import { ApiError } from '@finby/core';
import { SettingsHeader } from '../../components/settings/settings-header';
import { SectionLoading, SectionError } from '../../components/dashboard/section-card';
import { Field } from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { Dropdown } from '../../components/ui/dropdown';
import { Button } from '../../components/ui/button';
import { ConfirmSheet } from '../../components/settings/confirm-sheet';
import { useAuthStore } from '../../lib/use-auth-store';
import { api } from '../../lib/runtime.native';

const ROLE_OPTIONS: { value: 'VIEWER' | 'CO_MANAGER'; label: string }[] = [
  { value: 'VIEWER', label: 'Viewer' },
  { value: 'CO_MANAGER', label: 'Co-manager' },
];

export function MembersScreen() {
  const workspace = useAuthStore((s) => s.workspace);
  const [members, setMembers] = useState<MemberView[]>([]);
  const [invites, setInvites] = useState<InviteView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'VIEWER' | 'CO_MANAGER'>('VIEWER');
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<MemberView | null>(null);

  const isOwner = members.find((m) => m.isSelf)?.role === 'OWNER';

  const load = useCallback(() => {
    if (!workspace) return;
    setLoading(true);
    setLoadError(false);
    api.members
      .listMembers(workspace.id)
      .then(async (ms) => {
        setMembers(ms);
        if (ms.find((m) => m.isSelf)?.role === 'OWNER') {
          setInvites(await api.members.listInvites(workspace.id).catch(() => []));
        }
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [workspace]);

  const initialized = useRef(false);
  useEffect(() => {
    if (!workspace || initialized.current) return;
    initialized.current = true;
    load();
  }, [workspace, load]);

  async function invite() {
    if (!workspace || !email.trim()) return;
    setBusy(true);
    try {
      const inv = await api.members.inviteMember(workspace.id, email.trim(), inviteRole);
      setInvites((prev) => [inv, ...prev]);
      setEmail('');
    } catch (e) { if (!(e instanceof ApiError)) throw e; } finally { setBusy(false); }
  }

  async function changeRole(m: MemberView, role: WorkspaceMemberRole) {
    const updated = await api.members.changeMemberRole(workspace!.id, m.id, role).catch(() => null);
    if (updated) setMembers((prev) => prev.map((x) => (x.id === m.id ? updated : x)));
  }

  async function remove(m: MemberView) {
    setBusy(true);
    try {
      await api.members.removeMember(workspace!.id, m.id);
      setMembers((prev) => prev.filter((x) => x.id !== m.id));
      setRemoveTarget(null);
    } catch (e) { if (!(e instanceof ApiError)) throw e; } finally { setBusy(false); }
  }

  async function leave() {
    setBusy(true);
    setLeaveError(null);
    try {
      await api.members.leaveWorkspace(workspace!.id);
      setLeaving(false);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      setLeaveError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function resendInvite(inv: InviteView) {
    try {
      await api.members.resendInvite(workspace!.id, inv.id);
    } catch (e) { if (!(e instanceof ApiError)) throw e; }
  }

  async function cancelInvite(inv: InviteView) {
    try {
      await api.members.cancelInvite(workspace!.id, inv.id);
      setInvites((p) => p.filter((x) => x.id !== inv.id));
    } catch (e) { if (!(e instanceof ApiError)) throw e; }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <SettingsHeader title="Family members" />
      <ScrollView contentContainerClassName="gap-4 p-6">
        {loading ? (
          <SectionLoading />
        ) : loadError ? (
          <SectionError onRetry={load} />
        ) : (
          <>
            {members.map((m) => (
              <View key={m.id} className="gap-2 rounded-xl border border-line bg-surface px-4 py-3">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-2">
                    <Text className="text-base text-ink">{m.displayName}{m.isSelf ? ' (you)' : ''}</Text>
                    <Text className="text-xs text-faint">{m.email}</Text>
                  </View>
                  {isOwner && m.role !== 'OWNER' ? (
                    <Text onPress={() => setRemoveTarget(m)} accessibilityRole="button" className="text-xs font-medium text-danger">Remove</Text>
                  ) : (
                    <Text className="text-xs text-muted">{m.role === 'OWNER' ? 'Owner' : m.role === 'CO_MANAGER' ? 'Co-manager' : 'Viewer'}</Text>
                  )}
                </View>
                {isOwner && m.role !== 'OWNER' ? (
                  <Dropdown value={m.role === 'CO_MANAGER' ? 'CO_MANAGER' : 'VIEWER'} options={ROLE_OPTIONS}
                    accessibilityLabel={`Role for ${m.displayName}`} onSelect={(r) => void changeRole(m, r)} />
                ) : null}
              </View>
            ))}

            {isOwner ? (
              <View className="gap-3 rounded-xl border border-line bg-surface px-4 py-4">
                <Text className="text-sm font-semibold text-ink">Invite a member</Text>
                <Field label="Email"><Input value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="name@email.com" accessibilityLabel="Invite email" /></Field>
                <Field label="Role"><Dropdown value={inviteRole} options={ROLE_OPTIONS} accessibilityLabel="Invite role" onSelect={setInviteRole} /></Field>
                <Button disabled={!email.trim()} loading={busy} onPress={() => void invite()}>Send invite</Button>
              </View>
            ) : null}

            {isOwner && invites.length > 0 ? (
              <View className="gap-2">
                <Text className="text-xs font-semibold uppercase tracking-wide text-muted">Pending invites</Text>
                {invites.map((inv) => (
                  <View key={inv.id} className="flex-row items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
                    <Text className="flex-1 pr-2 text-sm text-ink">{inv.email}</Text>
                    <View className="flex-row gap-3">
                      <Text onPress={() => void resendInvite(inv)} accessibilityRole="button" className="text-xs font-medium text-accent">Resend</Text>
                      <Text onPress={() => void cancelInvite(inv)} accessibilityRole="button" className="text-xs font-medium text-danger">Cancel</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {!isOwner ? (
              <View className="gap-2">
                <Button variant="ghost" onPress={() => setLeaving(true)}>Leave this family</Button>
                {leaveError ? <Text className="text-sm text-danger">{leaveError}</Text> : null}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <ConfirmSheet open={removeTarget !== null} onClose={() => setRemoveTarget(null)} busy={busy} danger
        title="Remove member" message={`Remove ${removeTarget?.displayName} from this family?`} confirmLabel="Remove"
        onConfirm={() => removeTarget && void remove(removeTarget)} />
      <ConfirmSheet open={leaving} onClose={() => setLeaving(false)} busy={busy} danger
        title="Leave family" message="You'll lose access to this family's shared data." confirmLabel="Leave"
        onConfirm={() => void leave()} />
    </SafeAreaView>
  );
}
