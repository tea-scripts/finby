'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { AuthShell } from '@/components/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { PasswordInput } from '@/components/ui/password-input';
import { PasswordStrength } from '@/components/ui/password-strength';
import { resetPassword } from '@/lib/auth-api';

function ResetInner() {
  const token = useSearchParams().get('token') ?? '';
  const [pw, setPw] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await resetPassword(token, pw);
      setDone(true);
    } catch {
      setError('This reset link is invalid or has expired.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title={done ? 'Password updated' : 'Choose a new password'}
      subtitle={done ? 'You can now sign in with your new password.' : 'Enter a new password for your account.'}
      footer={<Link href="/login" className="font-medium text-accent hover:text-accent-hover">Back to sign in</Link>}
    >
      {done ? (
        <Link href="/login"><Button className="w-full">Sign in</Button></Link>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="New password" htmlFor="rp-pw" error={error ?? undefined}>
            <PasswordInput id="rp-pw" autoComplete="new-password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} />
            <PasswordStrength value={pw} />
          </Field>
          <Button type="submit" loading={loading} disabled={!token} className="w-full">Update password</Button>
        </form>
      )}
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetInner />
    </Suspense>
  );
}
