// apps/mobile/src/components/settings/workspace-switcher.tsx
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SettingsGroup } from './settings-group';
import { BottomSheet } from '../ui/bottom-sheet';
import { useAuthStore } from '../../lib/use-auth-store';
import { api } from '../../lib/runtime.native';

const ROLE_LABEL: Record<string, string> = { OWNER: 'Owner', CO_MANAGER: 'Co-manager', VIEWER: 'Viewer' };

export function WorkspaceSwitcher() {
  const workspace = useAuthStore((s) => s.workspace);
  const workspaces = useAuthStore((s) => s.workspaces);
  const setWorkspaces = useAuthStore((s) => s.setWorkspaces);
  const setActiveWorkspace = useAuthStore((s) => s.setActiveWorkspace);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.members.listWorkspaces().then(setWorkspaces).catch(() => undefined);
  }, [setWorkspaces]);

  if (!workspace) return null;
  const multiple = workspaces.length > 1;

  return (
    <SettingsGroup title="Workspace">
      <Pressable
        onPress={multiple ? () => setOpen(true) : undefined}
        disabled={!multiple}
        accessibilityRole={multiple ? 'button' : undefined}
        accessibilityLabel={multiple ? 'Switch workspace' : undefined}
        className="min-h-12 flex-row items-center justify-between px-4 py-3"
      >
        <Text className="text-base text-ink">{workspace.name}</Text>
        {multiple ? <Text className="text-base text-faint">›</Text> : null}
      </Pressable>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Switch workspace">
        <View className="gap-1 pb-2">
          {workspaces.map((w) => {
            const active = w.workspaceId === workspace.id;
            return (
              <Pressable
                key={w.workspaceId}
                onPress={() => { setActiveWorkspace(w.workspaceId); setOpen(false); }}
                accessibilityRole="button"
                className="flex-row items-center justify-between rounded-xl px-4 py-3"
              >
                <View>
                  <Text className={`text-base ${active ? 'text-accent' : 'text-ink'}`}>{w.name}</Text>
                  <Text className="text-xs text-faint">{ROLE_LABEL[w.role] ?? w.role}</Text>
                </View>
                {active ? <Text className="text-base text-accent">✓</Text> : null}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
    </SettingsGroup>
  );
}
