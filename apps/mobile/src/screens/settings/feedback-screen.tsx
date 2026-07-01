import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError } from '@finby/core';
import { SettingsHeader } from '../../components/settings/settings-header';
import { StarRating } from '../../components/settings/star-rating';
import { Field } from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/runtime.native';

export function FeedbackScreen() {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');

  async function submit() {
    if (rating < 1) return;
    setStatus('submitting');
    try {
      await api.feedback.submitFeedback(rating, comment);
      setStatus('done');
    } catch (e) {
      setStatus('error');
      if (!(e instanceof ApiError)) throw e;
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom']}>
      <SettingsHeader title="Feedback" />
      <ScrollView contentContainerClassName="gap-5 p-6">
        {status === 'done' ? (
          <View className="items-center gap-3 py-8">
            <Text className="text-4xl">⭐</Text>
            <Text className="text-center text-base text-ink">Thank you! Your feedback helps us make Finby better.</Text>
          </View>
        ) : (
          <>
            <Field label="How would you rate your experience?">
              <StarRating value={rating} onChange={setRating} />
            </Field>
            <Field label="Anything else? (optional)">
              <Input value={comment} onChangeText={setComment} multiline numberOfLines={4} maxLength={2000}
                placeholder="Anything you'd like us to know?" accessibilityLabel="Feedback comment" />
            </Field>
            {status === 'error' ? <Text className="text-sm text-danger">Could not submit. Try again.</Text> : null}
            <Button disabled={rating < 1} loading={status === 'submitting'} onPress={() => void submit()}>Submit review</Button>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
