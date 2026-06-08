import { Gift } from '@phosphor-icons/react/dist/ssr';

/** Refer & Earn teaser — feature not built yet, shown as "Coming soon". */
export function ReferSection() {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
        Refer &amp; Earn
      </h2>
      <div className="relative overflow-hidden rounded-2xl border border-line bg-surface/60 p-5 shadow-card">
        <span className="absolute right-4 top-4 rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-medium text-accent">
          Coming soon
        </span>
        <div className="flex items-start gap-3 pr-24">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft">
            <Gift size={22} weight="fill" className="text-accent" />
          </div>
          <div>
            <p className="text-sm font-medium text-ink">Invite friends, earn rewards</p>
            <p className="mt-0.5 text-sm text-muted">
              Soon you&apos;ll be able to share Finby and earn perks when friends join. Stay tuned.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
