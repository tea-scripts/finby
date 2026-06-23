import { createChatApi, type AuthedFetch, type AuthedStream } from '@finby/core';
import { useAuth } from './store';

const authed: AuthedFetch = <T>(p: string, i?: RequestInit) => useAuth.getState().authed<T>(p, i);
const authedStream: AuthedStream = (p: string, i?: RequestInit) => useAuth.getState().authedStream(p, i);

export const {
  listConversations, createConversation, listMessages, appendAssistantNote, sendMessage, streamMessage,
} = createChatApi({ authed, authedStream });
