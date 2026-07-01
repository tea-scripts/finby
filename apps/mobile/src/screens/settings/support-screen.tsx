import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SUPPORT_CATEGORIES, SUPPORT_CATEGORY_LABELS, type SupportCategory, type SupportTicketView } from '@finby/shared';
import { ApiError } from '@finby/core';
import { SettingsHeader } from '../../components/settings/settings-header';
import { Field } from '../../components/ui/field';
import { Dropdown } from '../../components/ui/dropdown';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/runtime.native';

const CATEGORY_OPTIONS = SUPPORT_CATEGORIES.map((c) => ({ value: c, label: SUPPORT_CATEGORY_LABELS[c] }));

// A `<View>` shouldn't carry a text-color class and vice-versa, so the badge
// bg and text colors are split into their own maps (same three tints).
const STATUS_BG: Record<SupportTicketView['status'], string> = {
  OPEN: 'bg-accent/15',
  IN_PROGRESS: 'bg-warn/15',
  RESOLVED: 'bg-success/15',
};
const STATUS_TEXT: Record<SupportTicketView['status'], string> = {
  OPEN: 'text-accent',
  IN_PROGRESS: 'text-warn',
  RESOLVED: 'text-success',
};

export function SupportScreen() {
  const [category, setCategory] = useState<SupportCategory>('BUG');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [tickets, setTickets] = useState<SupportTicketView[]>([]);

  useEffect(() => {
    api.support.listSupportTickets().then(setTickets).catch(() => { /* history is best-effort */ });
  }, []);

  async function submit() {
    if (!subject.trim() || !message.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const t = await api.support.createSupportTicket({ category, subject: subject.trim(), message: message.trim() });
      setTickets((prev) => [t, ...prev]);
      setSubject('');
      setMessage('');
      setSent(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom']}>
      <SettingsHeader title="Support" />
      <ScrollView contentContainerClassName="gap-5 p-6">
        <Text className="text-sm text-muted">Hit a snag? Send us a ticket and we&apos;ll reply by email.</Text>
        <Field label="Category">
          <Dropdown value={category} options={CATEGORY_OPTIONS} accessibilityLabel="Category" onSelect={(v) => setCategory(v)} />
        </Field>
        <Field label="Subject">
          <Input value={subject} onChangeText={setSubject} maxLength={160} placeholder="Short summary" accessibilityLabel="Subject" />
        </Field>
        <Field label="Message">
          <Input value={message} onChangeText={setMessage} multiline numberOfLines={4} maxLength={5000} placeholder="What's going on?" accessibilityLabel="Message" />
        </Field>
        {error ? <Text className="text-sm text-danger">{error}</Text> : null}
        {sent ? <Text className="text-sm text-success">Sent — we&apos;ll be in touch by email.</Text> : null}
        <Button disabled={!subject.trim() || !message.trim()} loading={submitting} onPress={() => void submit()}>Send</Button>

        {tickets.length > 0 ? (
          <View className="gap-2 pt-2">
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted">Your tickets</Text>
            {tickets.map((t) => (
              <View key={t.id} className="flex-row items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
                <View className="flex-1 pr-2">
                  <Text numberOfLines={1} className="text-base text-ink">{t.subject}</Text>
                  <Text className="text-xs text-faint">{SUPPORT_CATEGORY_LABELS[t.category]}</Text>
                </View>
                <View className={`rounded-full px-2.5 py-0.5 ${STATUS_BG[t.status]}`}>
                  <Text className={`text-xs font-semibold ${STATUS_TEXT[t.status]}`}>{t.status.replace('_', ' ')}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
