import { useAuth } from './store';

export interface FeedbackResult {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

/** Submit an in-app review (1–5 stars + optional note). */
export function submitFeedback(rating: number, comment?: string): Promise<FeedbackResult> {
  return useAuth.getState().authed<FeedbackResult>('/feedback', {
    method: 'POST',
    body: JSON.stringify({ rating, ...(comment?.trim() ? { comment: comment.trim() } : {}) }),
  });
}
