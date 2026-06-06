'use client';

import { PlanCard } from '@/components/billing/PlanCard';
import { useAuth } from '@/lib/store';

export default function SettingsPage() {
  const user = useAuth((s) => s.user);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6 animate-fade-up">
        <h1 className="font-display text-2xl font-bold text-ink">Settings</h1>

        {/* Profile section */}
        <section className="space-y-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
            Profile
          </h2>
          <div className="rounded-2xl border border-line bg-surface/60 p-5 shadow-card space-y-4">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Name</p>
              <p className="text-sm text-ink">{user?.displayName ?? '—'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Email</p>
              <p className="text-sm text-ink">{user?.email ?? '—'}</p>
            </div>
            <p className="text-xs text-faint">Editing coming soon.</p>
          </div>
        </section>

        {/* Plan & Billing section */}
        <section className="space-y-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
            Plan &amp; Billing
          </h2>
          <PlanCard />
        </section>
      </div>
    </div>
  );
}
