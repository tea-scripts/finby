'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

// Lazy-load LottieFiles' dotLottie player (React-19 compatible, robust
// autoplay). It loads the animation by URL from /public and fetches its wasm
// runtime on demand, so nothing heavy lands in the initial bundle.
const DotLottie = dynamic(
  () => import('@lottiefiles/dotlottie-react').then((m) => m.DotLottieReact),
  { ssr: false },
);

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = () => setReduced(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

/**
 * Decorative Lottie animation loaded from /public by URL. Honors
 * prefers-reduced-motion (renders an empty layout-preserving box instead of
 * animating) and is always aria-hidden — purely visual sugar.
 */
export function Lottie({
  src,
  loop = true,
  autoplay = true,
  className = '',
}: {
  src: string;
  loop?: boolean;
  autoplay?: boolean;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();

  if (reduced) {
    return <div className={className} aria-hidden="true" />;
  }

  return (
    <div className={className} aria-hidden="true">
      <DotLottie src={src} autoplay={autoplay} loop={loop} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
