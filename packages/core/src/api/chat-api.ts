import { parseSseFrames } from '../sse';
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
} from '@finby/shared';
import type { AuthedFetch, AuthedStream } from './contract';

export interface ChatApi {
  listConversations(workspaceId: string): Promise<ConversationSummary[]>;
  createConversation(workspaceId: string): Promise<CreatedConversation>;
  listMessages(workspaceId: string, conversationId: string): Promise<MessagesResult>;
  appendAssistantNote(workspaceId: string, conversationId: string, content: string): Promise<ChatMessageView>;
  sendMessage(workspaceId: string, conversationId: string, content: string): Promise<ChatResult>;
  streamMessage(
    workspaceId: string,
    conversationId: string,
    content: string,
    handlers: ChatStreamHandlers,
  ): Promise<void>;
}

export function createChatApi(deps: { authed: AuthedFetch; authedStream: AuthedStream }): ChatApi {
  const { authed, authedStream } = deps;
  return {
    async listConversations(workspaceId) {
      const res = await authed<ConversationListResult>(`/workspaces/${workspaceId}/conversations`);
      return res.conversations;
    },
    createConversation(workspaceId) {
      return authed<CreatedConversation>(`/workspaces/${workspaceId}/conversations`, {
        method: 'POST',
      });
    },
    listMessages(workspaceId, conversationId) {
      return authed<MessagesResult>(
        `/workspaces/${workspaceId}/conversations/${conversationId}/messages`,
      );
    },
    /** Persist a pre-composed assistant bubble (e.g. after a receipt-scan log)
     *  without running the chat AI pipeline. */
    appendAssistantNote(workspaceId, conversationId, content) {
      return authed<ChatMessageView>(
        `/workspaces/${workspaceId}/conversations/${conversationId}/notes`,
        { method: 'POST', body: JSON.stringify({ content }) },
      );
    },
    sendMessage(workspaceId, conversationId, content) {
      return authed<ChatResult>(
        `/workspaces/${workspaceId}/conversations/${conversationId}/messages`,
        { method: 'POST', body: JSON.stringify({ content }) },
      );
    },
    /** POSTs a chat message and streams the reply over SSE, dispatching events to
     *  the handlers. Throws ApiError (429/503/400) before any handler fires if the
     *  stream never starts — callers route that through their normal error path. */
    async streamMessage(workspaceId, conversationId, content, handlers) {
      const res = await authedStream(
        `/workspaces/${workspaceId}/conversations/${conversationId}/messages/stream`,
        { method: 'POST', body: JSON.stringify({ content }) },
      );

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Streaming not supported in this environment.');
      const decoder = new TextDecoder();
      let buffer = '';

      const dispatch = (ev: { event: string; data: string }): void => {
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
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = parseSseFrames(buffer);
        buffer = rest;
        for (const ev of events) dispatch(ev);
      }

      // Defensive flush: our server \n\n-terminates every frame, but if a final
      // frame arrived without the trailing blank line it would otherwise stay
      // buffered and `done` would never fire (hanging the UI). Appending the
      // delimiter is a no-op when the buffer is already empty.
      const { events } = parseSseFrames(buffer + '\n\n');
      for (const ev of events) dispatch(ev);
    },
  };
}
