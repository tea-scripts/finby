// apps/mobile/src/screens/subscription-screen.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ApiError } from '@finby/core';
import type { SubscriptionTier, SubscriptionView } from '@finby/shared';
import { useAuthStore } from '../lib/use-auth-store';
import { api } from '../lib/runtime.native';
import { SectionCard, SectionError, SectionLoading, type SectionState } from '../components/dashboard/section-card';
import { CurrentPlan } from '../components/billing/current-plan';
import { PlanCard } from '../components/billing/plan-card';
import { useTabBarSpace } from '../components/nav/floating-tab-bar';

export const WEB_BILLING_URL = 'https://chat.finby.app/settings';
const ALL_TIERS: SubscriptionTier[] = ['FREE', 'PRO', 'PREMIUM', 'FAMILY'];
const LOADING = { data: null, loading: true, error: null } as const;
function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Could not load your plan.';
}

export function SubscriptionScreen() {
  const workspace = useAuthStore((s) => s.workspace);
  const router = useRouter();
  const tabBarSpace = useTabBarSpace();

  const [sub, setSub] = useState<SectionState<SubscriptionView>>(LOADING);
  const [managing, setManaging] = useState(false);

  const load = useCallback(() => {
    if (!workspace) return Promise.resolve();
    setSub(LOADING);
    return api.billing
      .getSubscription(workspace.id)
      .then((d) => setSub({ data: d, loading: false, error: null }))
      .catch((e) => setSub({ data: null, loading: false, error: errMsg(e) }));
  }, [workspace]);

  const initialized = useRef(false);
  useEffect(() => {
    if (!workspace || initialized.current) return;
    initialized.current = true;
    void load();
  }, [workspace, load]);

  function openWebBilling() {
    void Linking.openURL(WEB_BILLING_URL).catch(() => {});
  }

  async function manage() {
    if (!workspace) return;
    setManaging(true);
    try {
      const { url } = await api.billing.openPortal(workspace.id);
      await Linking.openURL(url);
    } catch {
      /* best-effort; surfaced by the disabled state lifting */
    } finally {
      setManaging(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <View className="flex-row items-center gap-2 border-b border-line px-4 py-3">
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#e8eef7" />
        </Pressable>
        <Text className="text-lg font-semibold text-ink">Plan & Billing</Text>
      </View>

      <ScrollView contentContainerClassName="gap-6 px-4 py-5" contentContainerStyle={{ paddingBottom: tabBarSpace }}>
        <SectionCard title="Your plan">
          {sub.loading ? (
            <SectionLoading />
          ) : sub.error || !sub.data ? (
            <SectionError onRetry={load} />
          ) : (
            <CurrentPlan sub={sub.data} onUpgrade={openWebBilling} onManage={() => void manage()} managing={managing} />
          )}
        </SectionCard>

        <SectionCard title="All plans">
          <View className="gap-3">
            {ALL_TIERS.map((tier) => (
              <PlanCard key={tier} tier={tier} current={sub.data?.tier === tier} />
            ))}
          </View>
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  );
}
