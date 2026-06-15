import { create } from 'zustand';
import type { NewAchievement } from './types';

/**
 * Cross-component channel for milestone celebrations. The chat page sets the
 * achievements unlocked by a just-logged transaction; the header reads them to
 * auto-open the StreakSheet in its milestone state, then clears them.
 */
interface GamificationState {
  milestoneAchievements: NewAchievement[];
  setMilestoneAchievements: (achievements: NewAchievement[]) => void;
  clearMilestoneAchievements: () => void;
}

export const useGamificationStore = create<GamificationState>((set) => ({
  milestoneAchievements: [],
  setMilestoneAchievements: (achievements) => set({ milestoneAchievements: achievements }),
  clearMilestoneAchievements: () => set({ milestoneAchievements: [] }),
}));
