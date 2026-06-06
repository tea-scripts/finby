'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Lottie } from '@/components/ui/lottie';

const FLAG = 'finby_onboarded';

const SLIDES = [
  {
    src: '/lottie/onb-chat.json',
    title: 'Track money by chatting',
    body: 'Log expenses, income, and transfers just by talking to Finby — no forms, no spreadsheets.',
  },
  {
    src: '/lottie/onb-budget.json',
    title: 'Budgets that nudge you',
    body: 'Set budgets and get honest heads-ups at 75%, 90%, and 100% — before you overspend.',
  },
  {
    src: '/lottie/onb-insight.json',
    title: 'See where it goes',
    body: 'A glanceable dashboard and your full history, always one tap from the chat.',
  },
];

export function OnboardingCarousel() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;
  const slide = SLIDES[index]!;

  const finish = useCallback(
    (dest: string) => {
      try {
        localStorage.setItem(FLAG, '1');
      } catch {
        /* ignore storage failures */
      }
      router.push(dest);
    },
    [router],
  );

  const next = useCallback(() => {
    if (last) finish('/login');
    else setIndex((i) => i + 1);
  }, [last, finish]);

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, back]);

  return (
    <main className="relative flex min-h-app flex-col px-5 py-6">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-50" />

      <div className="relative flex justify-end">
        <button
          onClick={() => finish('/login')}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition hover:text-ink"
        >
          Skip
        </button>
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center text-center">
        <div key={index} className="flex flex-col items-center animate-fade-up">
          <Lottie src={slide.src} className="h-56 w-full max-w-sm" />
          <h1 className="mt-6 max-w-md text-balance font-display text-3xl font-bold text-ink">
            {slide.title}
          </h1>
          <p className="mt-3 max-w-sm text-balance text-muted">{slide.body}</p>
        </div>
      </div>

      <div className="relative mx-auto flex w-full max-w-sm flex-col gap-5">
        <div className="flex justify-center gap-2">
          {SLIDES.map((s, i) => (
            <span
              key={s.src}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? 'w-6 bg-accent' : 'w-1.5 bg-line'
              }`}
            />
          ))}
        </div>
        <div className="flex items-center justify-between">
          {index > 0 ? (
            <Button variant="ghost" onClick={back}>
              Back
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={next} className="min-w-28">
            {last ? 'Get started' : 'Next'}
          </Button>
        </div>
      </div>
    </main>
  );
}
