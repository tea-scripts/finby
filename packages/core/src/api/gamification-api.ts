import type { AchievementsResult, XpSummary, XpTransactionView } from '@finby/shared';
import type { AuthedFetch, AuthedStream } from './contract';

export interface GamificationApi {
  getXpSummary(workspaceId: string): Promise<XpSummary>;
  getXpHistory(workspaceId: string): Promise<XpTransactionView[]>;
  getAchievements(workspaceId: string): Promise<AchievementsResult>;
  /** Raw URL of a badge SVG. The endpoint is bearer-authenticated, so this can't
   *  be used directly as an <img src>; fetch it through getBadgeSvg instead. */
  getBadgeSvgUrl(workspaceId: string, slug: string): string;
  getBadgeSvg(workspaceId: string, slug: string): Promise<string>;
}

export function createGamificationApi(deps: {
  authed: AuthedFetch;
  authedStream: AuthedStream;
  apiBase: string;
}): GamificationApi {
  const { authed, authedStream, apiBase } = deps;
  return {
    getXpSummary(workspaceId) {
      return authed<XpSummary>(`/workspaces/${workspaceId}/gamification/xp`);
    },
    getXpHistory(workspaceId) {
      return authed<XpTransactionView[]>(`/workspaces/${workspaceId}/gamification/xp/history`);
    },
    getAchievements(workspaceId) {
      return authed<AchievementsResult>(`/workspaces/${workspaceId}/gamification/achievements`);
    },
    getBadgeSvgUrl(workspaceId, slug) {
      return `${apiBase}/workspaces/${workspaceId}/gamification/achievements/${slug}/badge.svg`;
    },
    async getBadgeSvg(workspaceId, slug) {
      const res = await authedStream(
        `/workspaces/${workspaceId}/gamification/achievements/${slug}/badge.svg`,
        { method: 'GET' },
      );
      return res.text();
    },
  };
}
