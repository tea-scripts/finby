import { createGamificationApi, type AuthedFetch, type AuthedStream } from '@finby/core';
import { API_BASE } from './api-client';
import { useAuth } from './store';

const authed: AuthedFetch = <T>(p: string, i?: RequestInit) => useAuth.getState().authed<T>(p, i);
const authedStream: AuthedStream = (p: string, i?: RequestInit) => useAuth.getState().authedStream(p, i);

export const { getXpSummary, getXpHistory, getAchievements, getBadgeSvgUrl, getBadgeSvg } =
  createGamificationApi({ authed, authedStream, apiBase: API_BASE });
