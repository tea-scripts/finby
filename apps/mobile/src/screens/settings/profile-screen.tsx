// apps/mobile/src/screens/settings/profile-screen.tsx
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { ApiError } from '@finby/core';
import { SettingsHeader } from '../../components/settings/settings-header';
import { Field } from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { useAuthStore } from '../../lib/use-auth-store';
import { api } from '../../lib/runtime.native';

export function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [name, setName] = useState(user?.displayName ?? '');
  const [timezone, setTimezone] = useState(user?.timezone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const dirty = name !== (user?.displayName ?? '') || timezone !== (user?.timezone ?? '');

  async function copyAccount() {
    if (!user?.accountNumber) return;
    await Clipboard.setStringAsync(user.accountNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.settings.updateProfile({ displayName: name.trim(), timezone: timezone.trim() });
      setUser(updated);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom']}>
      <SettingsHeader title="Profile" />
      <ScrollView contentContainerClassName="gap-5 p-6">
        {user?.accountNumber ? (
          <View className="gap-1.5">
            <Text className="text-xs font-medium uppercase tracking-wide text-muted">Account number</Text>
            <View className="flex-row items-center justify-between rounded-xl border border-line bg-surface px-3.5 py-3">
              <Text className="font-mono text-base text-ink">{user.accountNumber}</Text>
              <Text onPress={() => void copyAccount()} accessibilityRole="button" className="text-sm font-medium text-accent">
                {copied ? 'Copied' : 'Copy'}
              </Text>
            </View>
          </View>
        ) : null}

        <Field label="Name">
          <Input value={name} onChangeText={setName} autoComplete="name" accessibilityLabel="Name" />
        </Field>
        <Field label="Timezone">
          <Input value={timezone} onChangeText={setTimezone} accessibilityLabel="Timezone" />
        </Field>
        <Field label="Email" hint="Email can't be changed.">
          <Input value={user?.email ?? ''} editable={false} accessibilityLabel="Email" />
        </Field>

        {error ? <Text className="text-sm text-danger">{error}</Text> : null}

        <Button disabled={!dirty} loading={saving} onPress={() => void save()}>Save</Button>
      </ScrollView>
    </SafeAreaView>
  );
}
