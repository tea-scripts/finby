import { create } from 'zustand';
import type { AlertView } from '@/lib/types';

interface AlertsStore {
  // Drawer state
  open: boolean;
  // Data
  alerts: AlertView[];
  unreadCount: number;
  hasMore: boolean;
  nextCursor: string | null;
  loading: boolean;
  // Actions
  setOpen: (open: boolean) => void;
  setAlerts: (
    alerts: AlertView[],
    unreadCount: number,
    hasMore: boolean,
    nextCursor: string | null,
  ) => void;
  appendAlerts: (alerts: AlertView[], hasMore: boolean, nextCursor: string | null) => void;
  setLoading: (loading: boolean) => void;
  markRead: (alertId: string) => void;
  markAllRead: () => void;
  dismiss: (alertId: string) => void;
  decrementUnread: () => void;
}

export const useAlertsStore = create<AlertsStore>((set) => ({
  open: false,
  alerts: [],
  unreadCount: 0,
  hasMore: false,
  nextCursor: null,
  loading: false,
  setOpen: (open) => set({ open }),
  setAlerts: (alerts, unreadCount, hasMore, nextCursor) =>
    set({ alerts, unreadCount, hasMore, nextCursor }),
  appendAlerts: (newAlerts, hasMore, nextCursor) =>
    set((s) => ({ alerts: [...s.alerts, ...newAlerts], hasMore, nextCursor })),
  setLoading: (loading) => set({ loading }),
  markRead: (alertId) =>
    set((s) => ({
      alerts: s.alerts.map((a) => (a.id === alertId ? { ...a, status: 'READ' as const } : a)),
    })),
  markAllRead: () =>
    set((s) => ({
      alerts: s.alerts.map((a) => ({ ...a, status: 'READ' as const })),
      unreadCount: 0,
    })),
  dismiss: (alertId) =>
    set((s) => ({
      alerts: s.alerts.filter((a) => a.id !== alertId),
    })),
  decrementUnread: () => set((s) => ({ unreadCount: Math.max(0, s.unreadCount - 1) })),
}));
