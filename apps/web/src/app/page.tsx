import Link from 'next/link';
import { Logo } from '@/components/logo';
import { Lottie } from '@/components/ui/lottie';

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center px-4">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-50" />
      <div className="relative flex max-w-xl flex-col items-center text-center animate-fade-up">
        <Logo />
        <Lottie src="/lottie/hero.json" loop={false} className="mt-6 h-36 w-full max-w-xs" />
        <h1 className="mt-2 text-balance font-display text-4xl font-bold leading-tight text-ink sm:text-5xl">
          Your money, your buddy.
        </h1>
        <p className="mt-4 text-balance text-base text-muted sm:text-lg">
          Log expenses, track budgets, and get honest financial guidance — just by chatting.
        </p>
        <div className="mt-9 flex items-center gap-3">
          <Link
            href="/register"
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover shadow-[0_8px_24px_rgba(29,110,245,0.32)]"
          >
            Get started
          </Link>
          <Link
            href="/login"
            className="rounded-xl border border-line bg-surface px-5 py-2.5 text-sm font-medium text-ink transition hover:border-accent/50 hover:bg-surface-2"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
