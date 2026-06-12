'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../lib/auth-store';

/**
 * Gates the dashboard behind an admin token. Uses a `mounted` flag so the first
 * client render matches the server (both render nothing) — the auth-store reads
 * localStorage, which is client-only, so evaluating the token before mount would
 * cause a hydration mismatch.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !token) router.push('/login');
  }, [mounted, token, router]);

  if (!mounted || !token) return null;
  return <>{children}</>;
}
