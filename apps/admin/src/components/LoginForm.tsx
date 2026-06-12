'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { api, ApiError } from '../lib/api';
import { useAuthStore } from '../lib/auth-store';
import { Button } from './ui/button';
import { Field } from './ui/field';
import { Input } from './ui/input';
import { PasswordInput } from './ui/password-input';

export function LoginForm() {
  const router = useRouter();
  const setToken = useAuthStore((s) => s.setToken);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // Send `totp` only when filled — an empty string fails the API's 6-digit
      // validation (422) and would skip the enrollment-on-401 path below. First
      // login (no code yet) must omit it so the API returns 401 → enroll.
      const { accessToken } = await api.login({
        email,
        password,
        totp: totp.trim() || undefined,
      });
      setToken(accessToken);
      router.push('/');
    } catch (err) {
      // 401 with "TOTP enrollment required" → kick off enrollment.
      if (err instanceof ApiError && err.status === 401 && !qr) {
        try {
          const { otpauthUrl } = await api.enroll({ email, password });
          setQr(await QRCode.toDataURL(otpauthUrl));
          setError('Scan this QR in your authenticator app, then enter the 6-digit code.');
        } catch {
          setError('Invalid credentials.');
        }
      } else {
        setError('Invalid credentials or code.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-line bg-surface p-7 shadow-card"
      >
        <div className="mb-6 text-center">
          <span className="font-display text-2xl font-bold tracking-tight text-ink">Finby</span>
          <p className="mt-1 text-sm uppercase tracking-wide text-muted">Admin</p>
        </div>

        <div className="flex flex-col gap-4">
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@finby.app"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>

          <Field label="Password" htmlFor="password">
            <PasswordInput
              id="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>

          {qr && (
            <div className="flex justify-center">
              <div className="rounded-xl bg-white p-3">
                <img src={qr} alt="TOTP QR" className="h-44 w-44" />
              </div>
            </div>
          )}

          <Field label="Authenticator code" htmlFor="totp">
            <Input
              id="totp"
              inputMode="numeric"
              pattern="\d{6}"
              placeholder="6-digit code"
              value={totp}
              onChange={(e) => setTotp(e.target.value)}
            />
          </Field>

          {error && (
            <p className={`text-sm ${qr ? 'text-muted' : 'text-danger'}`}>{error}</p>
          )}

          <Button type="submit" loading={busy} className="w-full">
            Sign in
          </Button>
        </div>
      </form>
    </div>
  );
}
