import { createFeedbackApi, type AuthedFetch } from '@finby/core';
import { useAuth } from './store';

export type { FeedbackResult } from '@finby/core';

const authed: AuthedFetch = <T>(p: string, i?: RequestInit) => useAuth.getState().authed<T>(p, i);

export const { submitFeedback } = createFeedbackApi(authed);
