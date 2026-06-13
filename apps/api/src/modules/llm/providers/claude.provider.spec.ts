import { ClaudeProvider } from './claude.provider';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.schema';
import type { LlmStreamEvent } from '../llm.types';

function providerWithFakeClient(streamImpl: () => unknown): ClaudeProvider {
  const config = {
    get: (key: string) => (key === 'ANTHROPIC_MODEL' ? 'claude-sonnet-4-6' : 'test-key'),
  } as unknown as ConfigService<Env, true>;
  const provider = new ClaudeProvider(config);
  // Replace the real SDK client with a stub.
  (provider as unknown as { client: { messages: { stream: () => unknown } } }).client = {
    messages: { stream: streamImpl },
  };
  return provider;
}

/** A fake Anthropic MessageStream: async-iterable of raw events + finalMessage(). */
function fakeStream(rawEvents: unknown[], finalMessage: unknown) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const e of rawEvents) yield e;
    },
    finalMessage: async () => finalMessage,
  };
}

describe('ClaudeProvider.streamMessage', () => {
  it('yields text deltas then a complete event with the assembled response', async () => {
    const raw = [
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'lo' } },
    ];
    const finalMessage = {
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Hello' }],
    };
    const provider = providerWithFakeClient(() => fakeStream(raw, finalMessage));

    const events: LlmStreamEvent[] = [];
    for await (const e of provider.streamMessage({ system: 's', messages: [] })) {
      events.push(e);
    }

    expect(events).toEqual([
      { type: 'text_delta', text: 'Hel' },
      { type: 'text_delta', text: 'lo' },
      { type: 'complete', response: { stopReason: 'end_turn', content: [{ type: 'text', text: 'Hello' }], textOutput: 'Hello', toolCalls: [] } },
    ]);
  });

  it('assembles tool calls into the complete event', async () => {
    const finalMessage = {
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 't1', name: 'log_expense', input: { amountOriginal: '5' } }],
    };
    const provider = providerWithFakeClient(() => fakeStream([], finalMessage));

    const events: LlmStreamEvent[] = [];
    for await (const e of provider.streamMessage({ system: 's', messages: [] })) {
      events.push(e);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'complete',
      response: { toolCalls: [{ id: 't1', name: 'log_expense', input: { amountOriginal: '5' } }] },
    });
  });
});
