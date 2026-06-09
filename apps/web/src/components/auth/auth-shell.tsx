import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/logo';

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <main className="relative h-app overflow-y-auto">
      <div className="bg-grid pointer-events-none fixed inset-0 opacity-50" />
      <div className="relative flex min-h-full flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md animate-fade-up">
          <div className="mb-8 flex justify-center">
            <Link href="/" aria-label="Finby home">
              <Logo />
            </Link>
          </div>
          <div className="rounded-2xl border border-line bg-surface/80 p-7 shadow-card backdrop-blur">
            <h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
            <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
            <div className="mt-6">{children}</div>
          </div>
          <p className="mt-6 text-center text-sm text-muted">{footer}</p>
          <p className="mt-3 text-center text-xs text-faint">
            <Link href="/privacy" className="transition hover:text-muted">
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
