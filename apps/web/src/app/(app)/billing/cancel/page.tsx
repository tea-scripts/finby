'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function BillingCancelPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 animate-fade-up">
        <div className="rounded-2xl border border-line bg-surface/60 p-8 shadow-card flex flex-col items-center gap-6 text-center">
          <span className="text-4xl" role="img" aria-label="info">
            ℹ️
          </span>
          <div className="space-y-1">
            <h1 className="font-display text-xl font-bold text-ink">
              Checkout canceled
            </h1>
            <p className="text-sm text-muted">
              No changes were made. You can upgrade any time from Settings.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/settings">
              <Button variant="ghost">Back to Settings</Button>
            </Link>
            <Link href="/chat">
              <Button variant="primary">Go to Chat</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
