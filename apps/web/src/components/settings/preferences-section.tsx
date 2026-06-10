'use client';

import { useState, useEffect } from 'react';
import { DEFAULT_PREFERENCES } from '@finby/shared';
import type { CurrencyDisplay, DateFormat, NumberFormat, UserPreferences } from '@finby/shared';
import { Dropdown } from '@/components/ui/dropdown';
import { Field } from '@/components/ui/field';
import { NotifToggle } from '@/components/chat/notif-toggle';
import { detectIosSafariTab } from '@/lib/ios';
import { updateProfile } from '@/lib/settings-api';
import { useAuth } from '@/lib/store';

const DATE_FORMAT_OPTIONS: { value: DateFormat; label: string }[] = [
  { value: 'MEDIUM', label: 'MEDIUM — Jun 7, 2026' },
  { value: 'SHORT', label: 'SHORT — 07/06/2026' },
  { value: 'ISO', label: 'ISO — 2026-06-07' },
];

const CURRENCY_DISPLAY_OPTIONS: { value: CurrencyDisplay; label: string }[] = [
  { value: 'SYMBOL', label: 'Symbol — $1,234.50' },
  { value: 'CODE', label: 'Code — 1,234.50 USD' },
];

const NUMBER_FORMAT_OPTIONS: { value: NumberFormat; label: string }[] = [
  { value: 'GROUPED', label: 'Grouped — 1,234.50' },
  { value: 'PLAIN', label: 'Plain — 1234.50' },
];

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Display preferences: date / currency / number formatting + push notifications.
 *  Each dropdown change saves immediately (no Save button). */
export function PreferencesSection() {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const prefs: UserPreferences = user?.preferences ?? DEFAULT_PREFERENCES;

  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [pushOn, setPushOn] = useState(false);
  const [iosTab, setIosTab] = useState(false);
  useEffect(() => {
    setIosTab(detectIosSafariTab());
  }, []);

  // The reminder only fires when push is on AND the pref is enabled, so the
  // switch reflects that effective state — not just the stored pref (which
  // defaults to true and would otherwise read "on" before push is enabled).
  const reminderOn = pushOn && prefs.dailyReminders;

  async function savePref(patch: Partial<UserPreferences>) {
    setSaveState('saving');
    try {
      const updated = await updateProfile({ preferences: patch });
      setUser(updated);
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
          Preferences
        </h2>
        {saveState === 'saving' ? (
          <span className="text-xs text-faint">Saving…</span>
        ) : saveState === 'saved' ? (
          <span className="text-xs text-accent">Saved</span>
        ) : saveState === 'error' ? (
          <span className="text-xs text-danger">Couldn&apos;t save</span>
        ) : null}
      </div>

      <div className="space-y-5 rounded-2xl border border-line bg-surface/60 p-5 shadow-card">
        <Field
          label="Date format"
          htmlFor="pref-date-format"
          hint="How dates appear across the app."
        >
          <Dropdown
            id="pref-date-format"
            aria-label="Date format"
            value={prefs.dateFormat}
            options={DATE_FORMAT_OPTIONS}
            onChange={(v) => savePref({ dateFormat: v as DateFormat })}
          />
        </Field>

        <Field
          label="Currency display"
          htmlFor="pref-currency-display"
          hint="Show the currency symbol or its code."
        >
          <Dropdown
            id="pref-currency-display"
            aria-label="Currency display"
            value={prefs.currencyDisplay}
            options={CURRENCY_DISPLAY_OPTIONS}
            onChange={(v) => savePref({ currencyDisplay: v as CurrencyDisplay })}
          />
        </Field>

        <Field
          label="Number format"
          htmlFor="pref-number-format"
          hint="Group thousands or show plain numbers."
        >
          <Dropdown
            id="pref-number-format"
            aria-label="Number format"
            value={prefs.numberFormat}
            options={NUMBER_FORMAT_OPTIONS}
            onChange={(v) => savePref({ numberFormat: v as NumberFormat })}
          />
        </Field>

        {iosTab ? (
          <div className="rounded-xl border border-line bg-surface/60 p-3 text-xs text-muted">
            To get reminders on iPhone, tap the Share icon and choose{' '}
            <span className="font-medium text-ink">Add to Home Screen</span>, then open Finby from
            your home screen.
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
          <div>
            <p className="text-sm font-medium text-ink">Push notifications</p>
            <p className="text-xs text-muted">
              Get alerts on this device for reminders and updates.
            </p>
          </div>
          <NotifToggle onStateChange={(s) => setPushOn(s === 'on')} />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
          <div>
            <p className="text-sm font-medium text-ink">Daily reminder</p>
            <p className="text-xs text-muted">
              A nudge at ~8pm if you haven&apos;t logged anything that day. Requires notifications on.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={reminderOn}
            aria-label="Daily reminder"
            disabled={!pushOn || saveState === 'saving'}
            onClick={() => savePref({ dailyReminders: !prefs.dailyReminders })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50 ${
              reminderOn ? 'border-accent/50 bg-accent' : 'border-line bg-surface'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                reminderOn ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>
    </section>
  );
}
