import { parseSseFrames } from './sse';
import { useAuth } from './store';
import type {
  ChatAction,
  ChatMessageView,
  ChatResult,
  ChatStreamHandlers,
  ConversationListResult,
  ConversationSummary,
  CreatedConversation,
  MessagesResult,
  PendingConfirmation,
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

/** POSTs a chat message and streams the reply over SSE, dispatching events to
 *  the handlers. Throws ApiError (429/503/400) before any handler fires if the
 *  stream never starts — callers route that through their normal error path. */
export async function streamMessage(
  workspaceId: string,
  conversationId: string,
  content: string,
  handlers: ChatStreamHandlers,
): Promise<void> {
  const res = await useAuth.getState().authedStream(
    `/workspaces/${workspaceId}/conversations/${conversationId}/messages/stream`,
    { method: 'POST', body: JSON.stringify({ content }) },
  );

  const reader = res.body?.getReader();
  if (!reader) throw new Error('Streaming not supported in this environment.');
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseFrames(buffer);
    buffer = rest;
    for (const ev of events) {
      const payload: unknown = ev.data ? JSON.parse(ev.data) : {};
      switch (ev.event) {
        case 'text':
          handlers.onText((payload as { text: string }).text);
          break;
        case 'action':
          handlers.onAction((payload as { action: ChatAction }).action);
          break;
        case 'pending':
          handlers.onPending((payload as { confirmation: PendingConfirmation }).confirmation);
          break;
        case 'done':
          handlers.onDone((payload as { message: ChatMessageView }).message);
          break;
        case 'error':
          handlers.onError(payload as { code: string; message: string; details?: unknown });
          break;
        // 'start' is a no-op marker that the stream has begun.
      }
    }
  }
}
