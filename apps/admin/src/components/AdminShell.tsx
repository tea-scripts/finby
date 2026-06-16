'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '../lib/auth-store';
import { Button } from './ui/button';

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/users', label: 'Users' },
  { href: '/streaks', label: 'Streaks' },
  { href: '/tickets', label: 'Tickets' },
  { href: '/announcements', label: 'Announcements' },
] as const;

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`relative py-1 text-sm font-medium transition ${
        active ? 'text-ink' : 'text-muted hover:text-ink'
      }`}
    >
      {label}
      {active && (
        <span className="absolute inset-x-0 -bottom-[1.05rem] h-0.5 rounded-full bg-accent" />
      )}
    </Link>
  );
}

/** Branded top-nav shell shared by the dashboard and streaks pages. */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const setToken = useAuthStore((s) => s.setToken);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3.5">
          <div className="flex items-center gap-8">
            <span className="font-display text-lg font-bold tracking-tight text-ink">
              Finby{' '}
              <span className="text-sm font-semibold uppercase tracking-wide text-muted">
                Analytics
              </span>
            </span>
            <nav className="flex items-center gap-6">
              {NAV.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  active={item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)}
                />
              ))}
            </nav>
          </div>
          <Button variant="ghost" className="px-3 py-1.5" onClick={() => setToken(null)}>
            Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
