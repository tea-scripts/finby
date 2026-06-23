// apps/mobile/src/screens/forgot-password-screen.tsx
import { useState } from 'react';
import { Text } from 'react-native';
import { Link } from 'expo-router';
import { ScreenContainer } from '../components/ui/screen-container';
import { Button } from '../components/ui/button';
import { Field } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { AuthHeader } from '../components/auth/auth-header';
import { api } from '../lib/runtime.native';

export function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setLoading(true);
    try {
      await api.auth.forgotPassword(email.trim());
    } catch {
      /* generic response shown regardless — never reveal whether the email exists */
    }
    setSent(true);
    setLoading(false);
  }

  return (
    <ScreenContainer>
      <AuthHeader title="Reset your password" subtitle="We'll email you a link to choose a new one." />
      {sent ? (
        <Text className="text-sm text-muted">
          If an account exists for {email.trim()}, a reset link is on its way.
        </Text>
      ) : (
        <>
          <Field label="Email">
            <Input
              testID="fp-email"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
            />
          </Field>
          <Button onPress={onSubmit} loading={loading}>
            Send reset link
          </Button>
        </>
      )}
      <Link href="/login" className="text-center text-sm font-medium text-accent">
        Back to sign in
      </Link>
    </ScreenContainer>
  );
}
