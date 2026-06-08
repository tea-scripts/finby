'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChatCircleDots, GearSix, type Icon, Receipt, SquaresFour } from '@phosphor-icons/react';

const ITEMS: Array<{ href: string; label: string; Icon: Icon }> = [
  { href: '/chat', label: 'Chat', Icon: ChatCircleDots },
  { href: '/dashboard', label: 'Dashboard', Icon: SquaresFour },
  { href: '/transactions', label: 'Transactions', Icon: Receipt },
  { href: '/settings', label: 'Settings', Icon: GearSix },
];

const ACTIVE_GLOW = 'drop-shadow-[0_0_6px_rgba(29,110,245,0.55)]';

export function AppNav({ variant }: { variant: 'sidebar' | 'bar' }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  if (variant === 'sidebar') {
    return (
      <nav className="hidden w-56 shrink-0 flex-col gap-1 border-r border-line bg-surface/40 p-3 md:flex">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? 'bg-accent-soft text-accent'
                  : 'text-muted hover:bg-surface-2 hover:text-ink'
              }`}
            >
              <Icon
                size={20}
                weight={active ? 'fill' : 'regular'}
                className={active ? ACTIVE_GLOW : ''}
              />
              {label}
            </Link>
          );
        })}
      </nav>
    );
  }

  // Floating frosted capsule, inset from the screen edges and blurred over the
  // content scrolling beneath it. The wrapper is non-interactive so taps pass
  // through the gutters; only the capsule itself catches pointer events.
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(0.875rem,calc(env(safe-area-inset-bottom)+0.375rem))] md:hidden">
      <nav className="pointer-events-auto flex w-full max-w-sm items-stretch gap-1 rounded-[26px] border border-white/10 bg-surface-2/70 p-1.5 shadow-[0_14px_40px_-12px_rgba(0,0,0,0.85)] ring-1 ring-white/5 backdrop-blur-xl">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className="flex flex-1 justify-center"
            >
              <span
                className={`flex flex-col items-center gap-0.5 rounded-[20px] px-3 py-2 text-[10px] font-medium leading-none transition-colors ${
                  active ? 'bg-accent-soft text-accent' : 'text-muted hover:text-ink'
                }`}
              >
                <Icon
                  size={22}
                  weight={active ? 'fill' : 'regular'}
                  className={active ? ACTIVE_GLOW : ''}
                />
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
