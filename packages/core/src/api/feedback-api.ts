import type { AuthedFetch } from './contract';

export interface FeedbackResult {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export interface FeedbackApi {
  submitFeedback(rating: number, comment?: string): Promise<FeedbackResult>;
}

export function createFeedbackApi(authed: AuthedFetch): FeedbackApi {
  return {
    submitFeedback(rating, comment) {
      return authed<FeedbackResult>('/feedback', {
        method: 'POST',
        body: JSON.stringify({ rating, ...(comment?.trim() ? { comment: comment.trim() } : {}) }),
      });
    },
  };
}
