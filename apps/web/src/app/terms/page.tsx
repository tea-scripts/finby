import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/logo';
import { TermsContent, TERMS_LAST_UPDATED } from '@/components/legal/terms-content';

export const metadata: Metadata = {
  title: 'Terms of Service — Finby',
  description: 'The terms that govern your use of Finby.',
};

export default function TermsPage() {
  return (
    <div className="h-app overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-5 py-10">
        <Link href="/" className="inline-flex">
          <Logo />
        </Link>

        <h1 className="mt-8 font-display text-3xl font-bold text-ink">Terms of Service</h1>
        <p className="mt-1 text-sm text-faint">Last updated: {TERMS_LAST_UPDATED}</p>

        <div className="mt-8">
          <TermsContent />
        </div>

        <div className="mt-10 border-t border-line pt-6">
          <Link href="/" className="text-sm text-accent hover:text-accent-hover">
            ← Back to Finby
          </Link>
        </div>
      </div>
    </div>
  );
}
