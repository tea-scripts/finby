import { useAuth } from './store';
import type {
  ChatMessageView,
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

/** Persist a pre-composed assistant bubble (e.g. after a receipt-scan log)
 *  without running the chat AI pipeline. */
export function appendAssistantNote(
  workspaceId: string,
  conversationId: string,
  content: string,
): Promise<ChatMessageView> {
  return authed<ChatMessageView>(
    `/workspaces/${workspaceId}/conversations/${conversationId}/notes`,
    { method: 'POST', body: JSON.stringify({ content }) },
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
