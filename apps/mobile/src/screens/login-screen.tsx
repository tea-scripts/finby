// apps/mobile/src/screens/login-screen.tsx
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Link } from 'expo-router';
import { ApiError } from '@finby/core';
import { ScreenContainer } from '../components/ui/screen-container';
import { Button } from '../components/ui/button';
import { Field } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { PasswordInput } from '../components/ui/password-input';
import { AuthHeader } from '../components/auth/auth-header';
import { ErrorBanner } from '../components/auth/error-banner';
import { useAuthStore } from '../lib/use-auth-store';

export function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
      // The root gate navigates to (app) when status flips to 'authed'.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
      setLoading(false);
    }
  }

  return (
    <ScreenContainer>
      <AuthHeader title="Welcome back" subtitle="Sign in to keep talking to your money." />
      {error ? <ErrorBanner message={error} /> : null}

      <Field label="Email">
        <Input
          testID="email"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          invalid={Boolean(error)}
        />
      </Field>

      <Field label="Password">
        <PasswordInput
          testID="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChangeText={setPassword}
          invalid={Boolean(error)}
        />
      </Field>

      <Link href="/forgot-password" className="text-right text-sm font-medium text-accent">
        Forgot password?
      </Link>

      <Button onPress={onSubmit} loading={loading}>
        Sign in
      </Button>

      <View className="flex-row justify-center gap-1">
        <Text className="text-sm text-muted">New here?</Text>
        <Link href="/register" className="text-sm font-medium text-accent">
          Create an account
        </Link>
      </View>
    </ScreenContainer>
  );
}
