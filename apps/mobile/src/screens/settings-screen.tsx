// apps/mobile/src/screens/settings-screen.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ApiError } from '@finby/core';
import type { SubscriptionView } from '@finby/shared';
import { Button } from '../components/ui/button';
import { Toggle } from '../components/ui/toggle';
import {
  SectionCard,
  SectionError,
  SectionLoading,
  type SectionState,
} from '../components/dashboard/section-card';
import { CurrentPlanCard } from '../components/billing/current-plan-card';
import { PlanCarouselSheet } from '../components/billing/plan-carousel-sheet';
import { useAuthStore } from '../lib/use-auth-store';
import { api } from '../lib/runtime.native';

const LOADING = { data: null, loading: true, error: null } as const;

export function SettingsScreen() {
  const router = useRouter();
  const workspace = useAuthStore((s) => s.workspace);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const resetOnboarding = useAuthStore((s) => s.resetOnboarding);
  const lockEnabled = useAuthStore((s) => s.lockEnabled);
  const setLockEnabled = useAuthStore((s) => s.setLockEnabled);
  const currentStreak = useAuthStore((s) => s.user?.currentStreak ?? 0);

  const [sub, setSub] = useState<SectionState<SubscriptionView>>(LOADING);
  const [managing, setManaging] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(() => {
    if (!workspace) return Promise.resolve();
    setSub(LOADING);
    return api.billing
      .getSubscription(workspace.id)
      .then((d) => setSub({ data: d, loading: false, error: null }))
      .catch((e) =>
        setSub({ data: null, loading: false, error: e instanceof ApiError ? e.message : 'Could not load your plan.' }),
      );
  }, [workspace]);

  const initialized = useRef(false);
  useEffect(() => {
    if (!workspace || initialized.current) return;
    initialized.current = true;
    void load();
  }, [workspace, load]);

  async function manage() {
    if (!workspace) return;
    setManaging(true);
    try {
      const { url } = await api.billing.openPortal(workspace.id);
      await Linking.openURL(url);
    } catch {
      /* best-effort */
    } finally {
      setManaging(false);
    }
  }

  async function replayOnboarding() {
    await resetOnboarding();
    await logout();
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <View className="border-b border-line px-4 py-3">
        <Text className="text-lg font-semibold text-ink">Settings</Text>
      </View>

      <ScrollView contentContainerClassName="gap-6 p-6">
        <Pressable
          onPress={() => router.push('/streaks')}
          accessibilityRole="button"
          accessibilityLabel="View your streak progress"
          className="flex-row items-center justify-between rounded-xl border border-line bg-surface px-4 py-3"
        >
          <Text className="text-base text-ink">🔥 {currentStreak}-day streak</Text>
          <Text className="text-sm font-medium text-accent">View progress →</Text>
        </Pressable>

        <SectionCard title="Plan & Billing">
          {sub.loading ? (
            <SectionLoading />
          ) : sub.error || !sub.data ? (
            <SectionError onRetry={load} />
          ) : (
            <CurrentPlanCard
              sub={sub.data}
              onChangePlan={() => setSheetOpen(true)}
              onManage={() => void manage()}
              managing={managing}
            />
          )}
        </SectionCard>

        {user ? <Text className="text-muted">Signed in as {user.displayName}</Text> : null}

        <View className="flex-row items-center justify-between">
          <Text className="text-base text-ink">Biometric app lock</Text>
          <Toggle
            value={lockEnabled}
            onValueChange={(v) => void setLockEnabled(v)}
            accessibilityLabel="Biometric app lock"
          />
        </View>

        <Button variant="ghost" onPress={() => void logout()}>
          Log out
        </Button>

        {__DEV__ ? (
          <Button variant="ghost" onPress={() => void replayOnboarding()}>
            Replay onboarding (dev)
          </Button>
        ) : null}
      </ScrollView>

      <PlanCarouselSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        currentTier={sub.data?.tier ?? 'FREE'}
      />
    </SafeAreaView>
  );
}
