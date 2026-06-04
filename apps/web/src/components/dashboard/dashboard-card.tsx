import Link from 'next/link';
import type { ReactNode } from 'react';

/** Titled container for a dashboard section, with an optional corner action link. */
export function DashboardCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface/60 p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
          {title}
        </h2>
        {action && (
          <Link href={action.href} className="text-xs font-medium text-accent hover:text-accent-hover">
            {action.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export function SectionError({ message }: { message: string }) {
  return <p className="text-sm text-danger">{message}</p>;
}

export function SectionEmpty({ message }: { message: string }) {
  return <p className="text-sm text-faint">{message}</p>;
}
