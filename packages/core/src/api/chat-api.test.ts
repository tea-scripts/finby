import { describe, expect, it, vi } from 'vitest';
import { createChatApi } from './chat-api';

const ok = (payload: unknown) => vi.fn(async () => payload as never);

describe('createChatApi', () => {
  it('listConversations unwraps the { conversations } envelope', async () => {
    const authed = ok({ conversations: [{ id: 'c1' }] });
    const api = createChatApi({ authed, authedStream: vi.fn() as never });
    await expect(api.listConversations('ws1')).resolves.toEqual([{ id: 'c1' }]);
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/conversations');
  });

  it('sendMessage POSTs the content to the messages endpoint', async () => {
    const authed = ok({ message: { id: 'm1' }, actions: [], pendingConfirmations: [] });
    const api = createChatApi({ authed, authedStream: vi.fn() as never });
    await api.sendMessage('ws1', 'c1', 'hello');
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/conversations/c1/messages', {
      method: 'POST',
      body: JSON.stringify({ content: 'hello' }),
    });
  });

  it('streamMessage parses SSE frames from the stream and dispatches handlers', async () => {
    const frames = [
      'event: text\ndata: {"text":"hi"}\n\n',
      'event: done\ndata: {"message":{"id":"m1","role":"assistant","content":"hi","createdAt":"t"}}\n\n',
    ];
    const enc = new TextEncoder();
    let i = 0;
    const reader = {
      read: async () =>
        i < frames.length
          ? { done: false, value: enc.encode(frames[i++]!) }
          : { done: true, value: undefined },
    };
    const authedStream = vi.fn(async () => ({ body: { getReader: () => reader } }));
    const onText = vi.fn();
    const onDone = vi.fn();
    const api = createChatApi({ authed: ok({}), authedStream: authedStream as never });
    await api.streamMessage('ws1', 'c1', 'hello', {
      onText, onAction: vi.fn(), onPending: vi.fn(), onDone, onError: vi.fn(),
    });
    expect(authedStream).toHaveBeenCalledWith(
      '/workspaces/ws1/conversations/c1/messages/stream',
      { method: 'POST', body: JSON.stringify({ content: 'hello' }) },
    );
    expect(onText).toHaveBeenCalledWith('hi');
    expect(onDone).toHaveBeenCalledWith({ id: 'm1', role: 'assistant', content: 'hi', createdAt: 't' });
  });
});
