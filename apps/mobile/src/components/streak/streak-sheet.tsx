// apps/mobile/src/components/streak/streak-sheet.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { streakCelebration, type StreakCalendar, type StreakStatus, type XpSummary } from '@finby/shared';
import { BottomSheet } from '../ui/bottom-sheet';
import { Button } from '../ui/button';
import { WeekRow } from './week-row';
import { StreakShareCard } from './streak-share-card';
import { REPAIR_COST, shareCardStats, streakSheetState, type ShareCardStats } from '../../lib/streak-view';
import { chatNotice } from '../../lib/chat-notice';
import { useAuthStore } from '../../lib/use-auth-store';
import { api } from '../../lib/runtime.native';

/** Interactive streak sheet: fetches status/xp/calendar on open, drives the
 *  everyday state machine (new/active/recoverable/missed), repairs for 10 XP,
 *  and shares a generated brag card. Milestone + full history are slice 2. */
export function StreakSheet({ open, onClose, workspaceId }: { open: boolean; onClose: () => void; workspaceId: string }) {
  const user = useAuthStore((s) => s.user);
  const setStreak = useAuthStore((s) => s.setStreak);
  const [status, setStatus] = useState<StreakStatus | null>(null);
  const [xp, setXp] = useState<XpSummary | null>(null);
  const [calendar, setCalendar] = useState<StreakCalendar | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repairing, setRepairing] = useState(false);
  const cardRef = useRef<View>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, x, c] = await Promise.all([
        api.streaks.getStreakStatus(workspaceId),
        api.gamification.getXpSummary(workspaceId),
        api.streaks.getStreakCalendar(workspaceId),
      ]);
      setStatus(s);
      setXp(x);
      setCalendar(c);
    } catch (err) {
      setError(chatNotice(err).message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function repair() {
    setRepairing(true);
    setError(null);
    try {
      const next = await api.streaks.repairStreak(workspaceId);
      setStatus(next);
      setStreak(next.currentStreak, next.longestStreak);
      setXp(await api.gamification.getXpSummary(workspaceId));
    } catch (err) {
      setError(chatNotice(err).message);
    } finally {
      setRepairing(false);
    }
  }

  async function share() {
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
    } catch (err) {
      setError(chatNotice(err).message);
    }
  }

  const state = status && xp ? streakSheetState(status, xp.balance) : null;
  const stats: ShareCardStats | null =
    status && xp && calendar && user ? shareCardStats(user, status, xp, calendar) : null;

  return (
    <BottomSheet open={open} onClose={onClose} title="Your streak">
      {loading ? (
        <View className="items-center py-10">
          <ActivityIndicator color="#1d6ef5" />
        </View>
      ) : error && !status ? (
        <View className="items-center gap-3 py-8">
          <Text className="text-center text-sm text-muted">{error}</Text>
          <Button variant="ghost" onPress={() => void load()}>
            Retry
          </Button>
        </View>
      ) : status && xp && calendar && state ? (
        <View className="gap-4 pb-2">
          <View className="items-center gap-1">
            <Ionicons name="flame" size={40} color="#f5a524" />
            <Text testID="streak-count" className="text-3xl font-bold text-ink">{status.currentStreak}</Text>
            <Text className="text-sm text-muted">{status.currentStreak === 1 ? 'day' : 'days'} streak</Text>
          </View>

          {state === 'new' ? (
            <Text className="text-center text-sm text-muted">Log a transaction to start your streak 🔥</Text>
          ) : state === 'active' ? (
            <Text className="text-center text-sm text-muted">{streakCelebration(status.currentStreak)}</Text>
          ) : (
            <Text className="text-center text-sm text-warn">You missed yesterday — your streak is at risk.</Text>
          )}

          <WeekRow activeDays={calendar.activeDays} repairedDays={calendar.repairedDays} today={calendar.to} />

          {state !== 'new' ? (
            <View className="flex-row justify-between rounded-xl border border-line bg-surface-2 px-4 py-3">
              <Text className="text-sm text-muted">
                Today <Text className="text-ink">+{xp.todayEarned}</Text>
              </Text>
              <Text className="text-sm text-muted">
                Total <Text className="text-ink">{xp.balance} XP</Text>
              </Text>
            </View>
          ) : null}

          {state === 'recoverable' ? (
            <Button onPress={() => void repair()} loading={repairing} testID="streak-repair">
              {`Recover streak — ${REPAIR_COST} XP`}
            </Button>
          ) : state === 'missed' ? (
            <Button disabled testID="streak-repair-disabled">
              {status.repairUsedThisMonth ? 'Repair used this month' : `Need ${REPAIR_COST - xp.balance} more XP to recover`}
            </Button>
          ) : state === 'active' ? (
            <Button variant="ghost" onPress={() => void share()} testID="streak-share">
              Share your streak
            </Button>
          ) : null}

          {error && status ? <Text className="text-center text-xs text-danger">{error}</Text> : null}

          {stats ? (
            <View ref={cardRef} collapsable={false} style={{ position: 'absolute', left: -9999, top: 0 }}>
              <StreakShareCard stats={stats} />
            </View>
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}
