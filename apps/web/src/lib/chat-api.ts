import { useAuth } from './store';
import type {
  ChatResult,
  ConversationListResult,
  ConversationSummary,
  CreatedConversation,
  MessagesResult,
} from './types';

/** All chat calls go through the store's authed() so they carry the bearer
 *  token and transparently refresh on a 401. */
function authed<T>(path: string, init?: RequestInit): Promise<T> {
  return useAuth.getState().authed<T>(path, init);
}

export async function listConversations(workspaceId: string): Promise<ConversationSummary[]> {
  const res = await authed<ConversationListResult>(
    `/workspaces/${workspaceId}/conversations`,
  );
  return res.conversations;
}

export function createConversation(workspaceId: string): Promise<CreatedConversation> {
  return authed<CreatedConversation>(`/workspaces/${workspaceId}/conversations`, {
    method: 'POST',
  });
}

export function listMessages(
  workspaceId: string,
  conversationId: string,
): Promise<MessagesResult> {
  return authed<MessagesResult>(
    `/workspaces/${workspaceId}/conversations/${conversationId}/messages`,
  );
}

export function sendMessage(
  workspaceId: string,
  conversationId: string,
  content: string,
): Promise<ChatResult> {
  return authed<ChatResult>(
    `/workspaces/${workspaceId}/conversations/${conversationId}/messages`,
    { method: 'POST', body: JSON.stringify({ content }) },
  );
}
