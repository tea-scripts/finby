import { useEffect, useState } from 'react';
import type { WorkspaceMemberRole } from '@finby/shared';
import { useAuthStore } from './use-auth-store';
import { api } from './runtime.native';

/** Resolve the current user's role in the active workspace (VIEWER until loaded). */
export function useWorkspaceRole(): WorkspaceMemberRole {
  const workspaceId = useAuthStore((s) => s.workspace?.id);
  const [role, setRole] = useState<WorkspaceMemberRole>('VIEWER');
  useEffect(() => {
    if (!workspaceId) return;
    let active = true;
    api.members
      .listWorkspaces()
      .then((ws) => {
        if (!active) return;
        setRole(ws.find((w) => w.workspaceId === workspaceId)?.role ?? 'VIEWER');
      })
      .catch(() => { /* default VIEWER */ });
    return () => { active = false; };
  }, [workspaceId]);
  return role;
}
