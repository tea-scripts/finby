'use client';

import Link from 'next/link';
import { PlanCard } from '@/components/billing/PlanCard';
import { ProfileSection } from '@/components/settings/profile-section';
import { CurrenciesSection } from '@/components/settings/currencies-section';
import { PreferencesSection } from '@/components/settings/preferences-section';
import { FeedbackSection } from '@/components/settings/feedback-section';
import { MembersSection } from '@/components/settings/members-section';
import { ReferSection } from '@/components/settings/refer-section';

export default function SettingsPage() {
  return (
    <div className="h-full overflow-y-auto pb-nav">
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

        <MembersSection />

        <ReferSection />

        <FeedbackSection />

        {/* About & Legal */}
        <section className="space-y-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
            About
          </h2>
          <div className="rounded-2xl border border-line bg-surface/60 p-5 shadow-card">
            <Link
              href="/privacy"
              className="text-sm text-accent transition hover:text-accent-hover"
            >
              Privacy Policy
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
