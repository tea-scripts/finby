import { ServiceUnavailableException } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import type { ConversationsService } from './conversations.service';
import type { ChatService } from './chat.service';
import type { ChatStreamEvent } from './chat.types';
import type { WorkspaceContext } from '../../common/context';
import type { AuthUser } from '../auth/auth.types';

const workspace = { id: 'w1', tier: 'FREE', baseCurrency: 'USD' } as unknown as WorkspaceContext;
const user = { userId: 'u1' } as unknown as AuthUser;

function fakeRes() {
  const writes: string[] = [];
  return {
    writes,
    headersSent: false,
    writeHead(_status: number, _headers: Record<string, string>) {
      this.headersSent = true;
    },
    write(chunk: string) {
      writes.push(chunk);
      return true;
    },
    end() {},
  };
}

function controllerWith(events: ChatStreamEvent[] | (() => AsyncGenerator<ChatStreamEvent>)) {
  const chat = {
    streamMessage:
      typeof events === 'function'
        ? events
        : async function* () {
            for (const e of events) yield e;
          },
  } as unknown as ChatService;
  return new ConversationsController({} as unknown as ConversationsService, chat);
}

describe('ConversationsController.stream (SSE)', () => {
  it('writes one SSE frame per event and ends', async () => {
    const controller = controllerWith([
      { type: 'start' },
      { type: 'text', text: 'Hi' },
      { type: 'done', message: { id: 'm1', role: 'ASSISTANT', content: 'Hi', createdAt: 'now' } },
    ]);
    const res = fakeRes();

    await controller.stream(workspace, user, 'c1', { content: 'hello' }, res as never);

    expect(res.headersSent).toBe(true);
    expect(res.writes.filter((w) => w.startsWith('event:'))).toHaveLength(3);
    expect(res.writes.some((w) => w.includes('event: done'))).toBe(true);
  });

  it('lets a pre-stream throw propagate (no headers written) for HTTP error mapping', async () => {
    const controller = controllerWith(async function* () {
      throw new ServiceUnavailableException('down');
      yield { type: 'start' };
    });
    const res = fakeRes();

    await expect(
      controller.stream(workspace, user, 'c1', { content: 'hi' }, res as never),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(res.headersSent).toBe(false);
  });

  it('maps a mid-stream throw (after headers) to an SSE error frame', async () => {
    const controller = controllerWith(async function* () {
      yield { type: 'start' };
      throw new Error('boom');
    });
    const res = fakeRes();

    await controller.stream(workspace, user, 'c1', { content: 'hi' }, res as never);

    expect(res.headersSent).toBe(true);
    expect(res.writes.some((w) => w.includes('event: error'))).toBe(true);
  });
});
