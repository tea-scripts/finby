'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { AuthShell } from '@/components/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { verifyEmail } from '@/lib/auth-api';
import { useAuth } from '@/lib/store';

function VerifyInner() {
  const token = useSearchParams().get('token');
  const markVerified = useAuth((s) => s.markVerified);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) {
      setState('error');
      return;
    }
    verifyEmail(token)
      .then(() => {
        markVerified();
        setState('ok');
      })
      .catch(() => setState('error'));
  }, [token, markVerified]);

  return (
    <AuthShell
      title={state === 'ok' ? 'Email verified 🎉' : state === 'error' ? 'Link invalid' : 'Verifying…'}
      subtitle={
        state === 'ok'
          ? 'Your email is confirmed.'
          : state === 'error'
            ? 'This verification link is invalid or has expired.'
            : 'One moment while we confirm your email.'
      }
      footer={null}
    >
      {state === 'ok' && (
        <Link href="/chat">
          <Button className="w-full">Go to Finby</Button>
        </Link>
      )}
      {state === 'error' && (
        <Link href="/chat">
          <Button className="w-full">Back to Finby</Button>
        </Link>
      )}
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyInner />
    </Suspense>
  );
}
