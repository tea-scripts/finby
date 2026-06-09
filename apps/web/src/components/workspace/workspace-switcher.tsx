'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/store';

/** Dropdown to switch the active workspace. Hidden when the user has only one. */
export function WorkspaceSwitcher() {
  const workspaces = useAuth((s) => s.workspaces);
  const activeId = useAuth((s) => s.activeWorkspaceId);
  const setActive = useAuth((s) => s.setActiveWorkspace);
  const fetchWorkspaces = useAuth((s) => s.fetchWorkspaces);

  useEffect(() => {
    void fetchWorkspaces();
  }, [fetchWorkspaces]);

  if (workspaces.length < 2) return null;

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">Active workspace</span>
      <select
        value={activeId ?? ''}
        onChange={(e) => setActive(e.target.value)}
        className="rounded-lg border border-line bg-surface/60 px-2.5 py-1.5 text-sm text-ink"
      >
        {workspaces.map((w) => (
          <option key={w.workspaceId} value={w.workspaceId}>
            {w.name}
          </option>
        ))}
      </select>
    </label>
  );
}
