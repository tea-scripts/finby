'use client';

import { PlanCard } from '@/components/billing/PlanCard';
import { ProfileSection } from '@/components/settings/profile-section';
import { CurrenciesSection } from '@/components/settings/currencies-section';
import { PreferencesSection } from '@/components/settings/preferences-section';

export default function SettingsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6 animate-fade-up">
        <h1 className="font-display text-2xl font-bold text-ink">Settings</h1>

        <ProfileSection />

        <CurrenciesSection />

        <PreferencesSection />

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
