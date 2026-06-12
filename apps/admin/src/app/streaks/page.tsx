'use client';
import { AuthGate } from '../../components/AuthGate';
import { StreakLeaderboard } from '../../components/StreakLeaderboard';

export default function StreaksPage() {
  return (
    <AuthGate>
      <StreakLeaderboard />
    </AuthGate>
  );
}
