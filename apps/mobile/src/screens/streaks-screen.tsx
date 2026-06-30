// apps/mobile/src/screens/streaks-screen.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ApiError } from '@finby/core';
import type { AchievementsResult, StreakCalendar, StreakStatus, XpSummary, XpTransactionView } from '@finby/shared';
import { useAuthStore } from '../lib/use-auth-store';
import { api } from '../lib/runtime.native';
import { SectionCard, SectionError, SectionLoading, type SectionState } from '../components/dashboard/section-card';
import { StreakOverview } from '../components/streak/streak-overview';
import { StreakStatsGrid } from '../components/streak/streak-stats-grid';
import { AchievementsGrid } from '../components/streak/achievements-grid';
import { XpHistory } from '../components/streak/xp-history';
import { useTabBarSpace } from '../components/nav/floating-tab-bar';

const LOADING = { data: null, loading: true, error: null } as const;
function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Could not load this section.';
}

interface StreakGroup {
  status: StreakStatus;
  xp: XpSummary;
  calendar: StreakCalendar;
}

export function StreaksScreen() {
  const workspace = useAuthStore((s) => s.workspace);
  const router = useRouter();
  const tabBarSpace = useTabBarSpace();

  const [streak, setStreak] = useState<SectionState<StreakGroup>>(LOADING);
  const [achievements, setAchievements] = useState<SectionState<AchievementsResult>>(LOADING);
  const [history, setHistory] = useState<SectionState<XpTransactionView[]>>(LOADING);

  const loadStreak = useCallback(() => {
    if (!workspace) return Promise.resolve();
    setStreak(LOADING);
    return Promise.all([
      api.streaks.getStreakStatus(workspace.id),
      api.gamification.getXpSummary(workspace.id),
      api.streaks.getStreakCalendar(workspace.id),
    ])
      .then(([status, xp, calendar]) => setStreak({ data: { status, xp, calendar }, loading: false, error: null }))
      .catch((e) => setStreak({ data: null, loading: false, error: errMsg(e) }));
  }, [workspace]);

  const loadAchievements = useCallback(() => {
    if (!workspace) return Promise.resolve();
    setAchievements(LOADING);
    return api.gamification
      .getAchievements(workspace.id)
      .then((d) => setAchievements({ data: d, loading: false, error: null }))
      .catch((e) => setAchievements({ data: null, loading: false, error: errMsg(e) }));
  }, [workspace]);

  const loadHistory = useCallback(() => {
    if (!workspace) return Promise.resolve();
    setHistory(LOADING);
    return api.gamification
      .getXpHistory(workspace.id)
      .then((d) => setHistory({ data: d, loading: false, error: null }))
      .catch((e) => setHistory({ data: null, loading: false, error: errMsg(e) }));
  }, [workspace]);

  const initialized = useRef(false);
  useEffect(() => {
    if (!workspace || initialized.current) return;
    initialized.current = true;
    void loadStreak();
    void loadAchievements();
    void loadHistory();
  }, [workspace, loadStreak, loadAchievements, loadHistory]);

  const daysLogged = streak.data
    ? new Set([...streak.data.calendar.activeDays, ...streak.data.calendar.repairedDays]).size
    : 0;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <View className="flex-row items-center gap-2 border-b border-line px-4 py-3">
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#e8eef7" />
        </Pressable>
        <Text className="text-lg font-semibold text-ink">Streaks</Text>
      </View>

      <ScrollView contentContainerClassName="gap-6 px-4 py-5" contentContainerStyle={{ paddingBottom: tabBarSpace }}>
        <SectionCard title="Overview">
          {streak.loading ? (
            <SectionLoading />
          ) : streak.error || !streak.data ? (
            <SectionError onRetry={loadStreak} />
          ) : (
            <View className="gap-4">
              <StreakOverview currentStreak={streak.data.status.currentStreak} longestStreak={streak.data.status.longestStreak} />
              <StreakStatsGrid
                longestStreak={streak.data.status.longestStreak}
                daysLogged={daysLogged}
                totalXp={streak.data.xp.totalEarned}
                availableXp={streak.data.xp.balance}
              />
            </View>
          )}
        </SectionCard>

        <SectionCard title="Achievements">
          {achievements.loading ? (
            <SectionLoading />
          ) : achievements.error || !achievements.data ? (
            <SectionError onRetry={loadAchievements} />
          ) : workspace ? (
            <AchievementsGrid workspaceId={workspace.id} achievements={achievements.data} />
          ) : null}
        </SectionCard>

        <SectionCard title="XP history">
          {history.loading ? (
            <SectionLoading />
          ) : history.error || !history.data ? (
            <SectionError onRetry={loadHistory} />
          ) : (
            <XpHistory history={history.data} />
          )}
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  );
}
