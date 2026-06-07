'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { updateProfile } from '@/lib/settings-api';
import { useAuth } from '@/lib/store';

export function ProfileSection() {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [timezone, setTimezone] = useState(user?.timezone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  const dirty =
    displayName !== (user?.displayName ?? '') || timezone !== (user?.timezone ?? '');

  async function handleSave() {
    setSaving(true);
    setError(false);
    try {
      const updated = await updateProfile({ displayName, timezone });
      setUser(updated);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  async function handleCopy() {
    if (!user?.accountNumber) return;
    await navigator.clipboard.writeText(user.accountNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="space-y-3">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
        Profile
      </h2>
      <div className="space-y-4 rounded-2xl border border-line bg-surface/60 p-5 shadow-card">
        <Field label="Name" htmlFor="profile-name">
          <Input
            id="profile-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="name"
          />
        </Field>

        <Field label="Timezone" htmlFor="profile-timezone">
          <Input
            id="profile-timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          />
        </Field>

        <Field label="Email" htmlFor="profile-email" hint="Email can't be changed.">
          <Input id="profile-email" value={user?.email ?? ''} disabled readOnly />
        </Field>

        <div className="space-y-1.5">
          <p className="block text-xs font-medium uppercase tracking-wide text-muted">
            Account number
          </p>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-ink">
              {user?.accountNumber ?? '—'}
            </span>
            {user?.accountNumber ? (
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-lg border border-line px-2 py-1 text-xs font-medium text-muted transition hover:border-accent/50 hover:text-ink"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            ) : null}
          </div>
        </div>

        {error ? (
          <p className="text-xs text-danger">Couldn&apos;t save. Please try again.</p>
        ) : null}

        <Button onClick={handleSave} disabled={!dirty || saving} loading={saving}>
          Save
        </Button>
      </div>
    </section>
  );
}
