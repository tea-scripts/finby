'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { api, ApiError } from '../lib/api';
import { useAuthStore } from '../lib/auth-store';

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
      const { accessToken } = await api.login({ email, password, totp });
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
    <form onSubmit={submit} className="mx-auto mt-24 flex w-full max-w-sm flex-col gap-3 rounded-xl border bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold">Finby Admin</h1>
      <input className="rounded border px-3 py-2" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input className="rounded border px-3 py-2" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {qr && <img src={qr} alt="TOTP QR" className="mx-auto h-44 w-44" />}
      <input className="rounded border px-3 py-2" inputMode="numeric" pattern="\d{6}" placeholder="6-digit code" value={totp} onChange={(e) => setTotp(e.target.value)} />
      {error && <p className="text-sm text-amber-700">{error}</p>}
      <button disabled={busy} className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50">
        {busy ? '…' : 'Sign in'}
      </button>
    </form>
  );
}
