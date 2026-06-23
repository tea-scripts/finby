import { createAlertsApi, type AuthedFetch } from '@finby/core';
import { useAuth } from '@/lib/store';

const authed: AuthedFetch = <T>(p: string, i?: RequestInit) => useAuth.getState().authed<T>(p, i);

export const { listAlerts, updateAlertStatus, markAllAlertsRead } = createAlertsApi(authed);
