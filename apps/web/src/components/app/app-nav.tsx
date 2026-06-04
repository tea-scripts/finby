'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType } from 'react';

function ChatIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.5A8 8 0 1 1 21 12Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}
function GridIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
function ListIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 6h13M8 12h13M8 18h13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="3.5" cy="6" r="1.3" fill="currentColor" />
      <circle cx="3.5" cy="12" r="1.3" fill="currentColor" />
      <circle cx="3.5" cy="18" r="1.3" fill="currentColor" />
    </svg>
  );
}

const ITEMS: Array<{ href: string; label: string; Icon: ComponentType }> = [
  { href: '/chat', label: 'Chat', Icon: ChatIcon },
  { href: '/dashboard', label: 'Dashboard', Icon: GridIcon },
  { href: '/transactions', label: 'Transactions', Icon: ListIcon },
];

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
              <Icon />
              {label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex border-t border-line bg-surface/80 backdrop-blur md:hidden">
      {ITEMS.map(({ href, label, Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
              active ? 'text-accent' : 'text-muted'
            }`}
          >
            <Icon />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
