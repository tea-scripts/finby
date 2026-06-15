import { API_BASE } from './api-client';
import { useAuth } from './store';
import type { AchievementsResult, XpSummary, XpTransactionView } from './types';

function authed<T>(path: string, init?: RequestInit): Promise<T> {
  return useAuth.getState().authed<T>(path, init);
}

export function getXpSummary(workspaceId: string): Promise<XpSummary> {
  return authed<XpSummary>(`/workspaces/${workspaceId}/gamification/xp`);
}

export function getXpHistory(workspaceId: string): Promise<XpTransactionView[]> {
  return authed<XpTransactionView[]>(`/workspaces/${workspaceId}/gamification/xp/history`);
}

export function getAchievements(workspaceId: string): Promise<AchievementsResult> {
  return authed<AchievementsResult>(`/workspaces/${workspaceId}/gamification/achievements`);
}

/** Raw URL of a badge SVG. The endpoint is bearer-authenticated, so this can't
 *  be used directly as an <img src>; fetch it through getBadgeSvg instead (which
 *  attaches the token). Kept for callers that need the canonical URL. */
export function getBadgeSvgUrl(workspaceId: string, slug: string): string {
  return `${API_BASE}/workspaces/${workspaceId}/gamification/achievements/${slug}/badge.svg`;
}

/** Fetch a badge SVG as text with auth, for inline / blob-URL rendering. */
export async function getBadgeSvg(workspaceId: string, slug: string): Promise<string> {
  const res = await useAuth
    .getState()
    .authedStream(`/workspaces/${workspaceId}/gamification/achievements/${slug}/badge.svg`, {
      method: 'GET',
    });
  return res.text();
}
