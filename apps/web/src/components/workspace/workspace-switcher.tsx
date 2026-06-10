'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/store';
import { Dropdown } from '@/components/ui/dropdown';

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
    <Dropdown
      value={activeId ?? ''}
      onChange={setActive}
      options={workspaces.map((w) => ({ value: w.workspaceId, label: w.name }))}
      aria-label="Active workspace"
      className="min-w-0 max-w-[40vw] sm:max-w-44"
    />
  );
}
