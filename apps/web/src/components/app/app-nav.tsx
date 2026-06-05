'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChatCircleDots, type Icon, Receipt, SquaresFour } from '@phosphor-icons/react';

const ITEMS: Array<{ href: string; label: string; Icon: Icon }> = [
  { href: '/chat', label: 'Chat', Icon: ChatCircleDots },
  { href: '/dashboard', label: 'Dashboard', Icon: SquaresFour },
  { href: '/transactions', label: 'Transactions', Icon: Receipt },
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

  return (
    <nav className="flex border-t border-line bg-surface/80 backdrop-blur pb-safe md:hidden">
      {ITEMS.map(({ href, label, Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition ${
              active ? 'text-accent' : 'text-muted'
            }`}
          >
            <Icon
              size={22}
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
