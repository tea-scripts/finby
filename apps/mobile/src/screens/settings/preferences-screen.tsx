import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CurrencyDisplay, DateFormat, NumberFormat, UserPreferences } from '@finby/shared';
import { ApiError } from '@finby/core';
import { SettingsHeader } from '../../components/settings/settings-header';
import { Field } from '../../components/ui/field';
import { Dropdown } from '../../components/ui/dropdown';
import { Toggle } from '../../components/ui/toggle';
import { useTabBarSpace } from '../../components/nav/floating-tab-bar';
import { useAuthStore } from '../../lib/use-auth-store';
import { usePushStore } from '../../lib/use-push-store';
import { api, push } from '../../lib/runtime.native';

const DATE_OPTIONS: { value: DateFormat; label: string }[] = [
  { value: 'MEDIUM', label: 'Jun 7, 2026' },
  { value: 'SHORT', label: '07/06/2026' },
  { value: 'ISO', label: '2026-06-07' },
];
const CURRENCY_OPTIONS: { value: CurrencyDisplay; label: string }[] = [
  { value: 'SYMBOL', label: '$1,234.50' },
  { value: 'CODE', label: '1,234.50 USD' },
];
const NUMBER_OPTIONS: { value: NumberFormat; label: string }[] = [
  { value: 'GROUPED', label: '1,234.50' },
  { value: 'PLAIN', label: '1234.50' },
];

export function PreferencesScreen() {
  const workspace = useAuthStore((s) => s.workspace);
  const user = useAuthStore((s) => s.user);
  const prefs = user?.preferences;
  const setUser = useAuthStore((s) => s.setUser);
  const pushState = usePushStore((s) => s.state);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const tabBarSpace = useTabBarSpace();

  const pushOn = pushState === 'on';
  const dailyReminders = prefs?.dailyReminders ?? true;
  const reminderOn = pushOn && dailyReminders;

  async function savePref(patch: Partial<UserPreferences>) {
    setStatus('saving');
    try {
      const updated = await api.settings.updateProfile({ preferences: patch });
      setUser(updated);
      setStatus('saved');
    } catch (e) {
      setStatus('error');
      if (!(e instanceof ApiError)) throw e;
    }
  }

  async function togglePush(next: boolean) {
    if (!workspace) return;
    if (next) await push.enablePush(workspace.id);
    else await push.disablePush(workspace.id);
  }

  async function toggleDailyReminder() {
    await savePref({ dailyReminders: !dailyReminders });
  }

  const statusLabel = status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? 'Could not save' : '';

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <SettingsHeader title="Preferences" />
      <ScrollView contentContainerClassName="gap-5 p-6" contentContainerStyle={{ paddingBottom: tabBarSpace }}>
        {statusLabel ? <Text className={`text-xs ${status === 'error' ? 'text-danger' : 'text-faint'}`}>{statusLabel}</Text> : null}

        <Field label="Date format" hint="How dates appear across the app.">
          <Dropdown
            value={prefs?.dateFormat ?? 'MEDIUM'}
            options={DATE_OPTIONS}
            accessibilityLabel="Date format"
            onSelect={(v) => void savePref({ dateFormat: v })}
          />
        </Field>
        <Field label="Currency display" hint="Show the currency symbol or its code.">
          <Dropdown
            value={prefs?.currencyDisplay ?? 'SYMBOL'}
            options={CURRENCY_OPTIONS}
            accessibilityLabel="Currency display"
            onSelect={(v) => void savePref({ currencyDisplay: v })}
          />
        </Field>
        <Field label="Number format" hint="Group thousands or show plain numbers.">
          <Dropdown
            value={prefs?.numberFormat ?? 'GROUPED'}
            options={NUMBER_OPTIONS}
            accessibilityLabel="Number format"
            onSelect={(v) => void savePref({ numberFormat: v })}
          />
        </Field>

        <Field
          label="Push notifications"
          hint={
            pushState === 'denied'
              ? 'Enable notifications for Finby in your device Settings.'
              : 'Get alerts on this device for reminders and updates.'
          }
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-base text-ink">Push notifications</Text>
            <Toggle value={pushOn} onValueChange={(v) => void togglePush(v)} accessibilityLabel="Push notifications" />
          </View>
        </Field>

        <Field label="Daily reminder" hint="A nudge at ~8pm if you haven't logged anything that day. Requires notifications on.">
          <View className="flex-row items-center justify-between">
            <Text className="text-base text-ink">Daily reminder</Text>
            <Toggle
              value={reminderOn}
              disabled={!pushOn}
              onValueChange={() => void toggleDailyReminder()}
              accessibilityLabel="Daily reminder"
            />
          </View>
        </Field>
      </ScrollView>
    </SafeAreaView>
  );
}
