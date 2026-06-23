// apps/mobile/src/screens/register-screen.tsx
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Link } from 'expo-router';
import { ApiError } from '@finby/core';
import { CURRENCIES } from '@finby/shared';
import { ScreenContainer } from '../components/ui/screen-container';
import { Button } from '../components/ui/button';
import { Field } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { PasswordInput } from '../components/ui/password-input';
import { PasswordStrengthMeter } from '../components/ui/password-strength-meter';
import { Dropdown } from '../components/ui/dropdown';
import { AuthHeader } from '../components/auth/auth-header';
import { ErrorBanner } from '../components/auth/error-banner';
import { TermsGate } from '../components/auth/terms-gate';
import { useAuthStore } from '../lib/use-auth-store';
import { getDeviceTimeZone } from '../adapters/localization.native';

const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }));

export function RegisterScreen() {
  const register = useAuthStore((s) => s.register);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [timezone] = useState(getDeviceTimeZone);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError(null);
    if (!displayName.trim()) {
      setError('What should Finby call you?');
      return;
    }
    if (!email.trim()) {
      setError('Enter your email.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!acceptedTerms) {
      setError('Please read and accept the Terms to continue.');
      return;
    }
    setLoading(true);
    try {
      await register({
        displayName: displayName.trim(),
        email: email.trim(),
        password,
        baseCurrency,
        timezone,
      });
      // The root gate navigates to (app) on success.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
      setLoading(false);
    }
  }

  return (
    <ScreenContainer>
      <AuthHeader title="Create your account" subtitle="Start logging expenses just by chatting." />
      {error ? <ErrorBanner message={error} /> : null}

      <Field label="Name">
        <Input testID="displayName" autoComplete="name" placeholder="Alex" value={displayName} onChangeText={setDisplayName} />
      </Field>

      <Field label="Email">
        <Input
          testID="email"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
        />
      </Field>

      <Field label="Password" hint="At least 8 characters.">
        <PasswordInput testID="password" autoComplete="new-password" placeholder="••••••••" value={password} onChangeText={setPassword} />
        <PasswordStrengthMeter password={password} />
      </Field>

      <Field label="Base currency" hint={`Timezone detected: ${timezone}`}>
        <Dropdown value={baseCurrency} options={CURRENCY_OPTIONS} onSelect={setBaseCurrency} accessibilityLabel="Base currency" />
      </Field>

      <TermsGate accepted={acceptedTerms} onAcceptedChange={setAcceptedTerms} />

      <Button onPress={onSubmit} loading={loading} disabled={!acceptedTerms}>
        Create account
      </Button>

      <View className="flex-row justify-center gap-1">
        <Text className="text-sm text-muted">Already have an account?</Text>
        <Link href="/login" className="text-sm font-medium text-accent">
          Sign in
        </Link>
      </View>
    </ScreenContainer>
  );
}
