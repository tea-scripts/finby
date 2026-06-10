'use client';

import { NotifToggle } from '@/components/chat/notif-toggle';
import { Logo } from '@/components/logo';
import { TierBadge } from '@/components/ui/tier-badge';
import { WorkspaceSwitcher } from '@/components/workspace/workspace-switcher';
import { useAuth } from '@/lib/store';

/** Shared top header for the authed app shell.
 *  (Logo · tier · workspace switcher · user · notifications). Sign out lives in Settings. */
export function AppHeader() {
  const user = useAuth((s) => s.user);
  const tier = useAuth((s) => s.workspace?.tier) ?? 'FREE';

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-canvas/80 backdrop-blur pt-safe">
      <div className="flex w-full items-center justify-between gap-2 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Logo />
          <TierBadge tier={tier} />
          <WorkspaceSwitcher />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {user && <span className="hidden text-sm text-muted sm:inline">{user.displayName}</span>}
          <NotifToggle />
        </div>
      </div>
    </header>
  );
}
