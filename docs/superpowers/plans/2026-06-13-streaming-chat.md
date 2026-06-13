# Streaming Chat Responses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream chat replies over SSE so reply text types in live and action cards appear the instant a tool commits, instead of waiting for the whole agentic loop.

**Architecture:** A new `ChatService.streamMessage()` async generator becomes the single source of truth for the agentic loop; the existing `handleMessage()` (JSON) is rewritten to drain it. A new `POST .../messages/stream` controller endpoint flushes generator events as SSE frames, reserving HTTP error statuses (429/503/400) for failures that occur before the stream connects. The frontend consumes the stream with `fetch` + a ReadableStream reader (preserving bearer-token auth), feeding deltas into a live assistant bubble.

**Tech Stack:** NestJS (Express), `@anthropic-ai/sdk@0.100.1` (`messages.stream()`), Prisma, Next.js, Zustand, Vitest (web) / Jest (api).

**Spec:** `docs/superpowers/specs/2026-06-13-streaming-chat-design.md`

**Branch:** `feat/streaming-chat` (already created).

---

## File Structure

**Backend (`apps/api/src`)**
- `modules/llm/llm.types.ts` — add `LlmStreamEvent` union + `streamMessage` to `LlmProvider`. (modify)
- `modules/llm/providers/claude.provider.ts` — implement `streamMessage` via SDK `messages.stream()`. (modify)
- `modules/llm/providers/claude.provider.spec.ts` — provider stream-mapping test. (create)
- `modules/llm/llm.service.ts` — passthrough `streamMessage`. (modify)
- `modules/chat/chat.types.ts` — add `ChatStreamEvent` union. (modify)
- `modules/chat/chat.service.ts` — add `streamMessage()` generator; rewrite `handleMessage()` as a drain adapter. (modify)
- `modules/chat/chat.service.spec.ts` — migrate llm mocks to `streamMessage`; add event-sequence tests. (modify)
- `modules/chat/conversations.controller.ts` — add SSE endpoint. (modify)
- `modules/chat/conversations.controller.spec.ts` — SSE framing / header-timing / error test. (create)

**Frontend (`apps/web/src`)**
- `lib/sse.ts` — pure `parseSseFrames()` parser. (create)
- `lib/sse.test.ts` — parser tests. (create)
- `lib/store.ts` — add `authedStream()`. (modify)
- `lib/types.ts` — mirror `ChatStreamEvent` / handler types. (modify)
- `lib/chat-api.ts` — add `streamMessage()` client. (modify)
- `app/(app)/chat/page.tsx` — wire `handleSend` to streaming. (modify)

---

## Task 1: LLM provider streaming method

**Files:**
- Modify: `apps/api/src/modules/llm/llm.types.ts`
- Modify: `apps/api/src/modules/llm/providers/claude.provider.ts`
- Modify: `apps/api/src/modules/llm/llm.service.ts`
- Test: `apps/api/src/modules/llm/providers/claude.provider.spec.ts` (create)

- [ ] **Step 1: Add stream types + port method**

In `llm.types.ts`, add after the `LlmResponse` interface:

```ts
export type LlmStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'complete'; response: LlmResponse };
```

In the same file, extend the `LlmProvider` interface:

```ts
export interface LlmProvider {
  createMessage(params: LlmCreateParams): Promise<LlmResponse>;
  /** Streams text deltas as they arrive, then emits a terminal `complete`
   *  event carrying the fully assembled response (same shape as createMessage). */
  streamMessage(params: LlmCreateParams): AsyncIterable<LlmStreamEvent>;
}
```

- [ ] **Step 2: Write the failing provider test**

Create `apps/api/src/modules/llm/providers/claude.provider.spec.ts`:

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter finby-api exec jest src/modules/llm/providers/claude.provider.spec.ts`
Expected: FAIL — `provider.streamMessage is not a function`.

- [ ] **Step 4: Implement `streamMessage` in the provider**

In `claude.provider.ts`, add this method to the `ClaudeProvider` class, right after `createMessage`:

```ts
  async *streamMessage(params: LlmCreateParams): AsyncGenerator<LlmStreamEvent> {
    const stream = this.client.messages.stream({
      model: params.model ?? this.model,
      max_tokens: params.maxTokens ?? 1024,
      system: params.system,
      messages: params.messages.map((m) => toMessageParam(m)),
      ...(params.tools
        ? {
            tools: params.tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.input_schema as Anthropic.Tool['input_schema'],
            })),
          }
        : {}),
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { type: 'text_delta', text: event.delta.text };
      }
    }

    yield { type: 'complete', response: mapResponse(await stream.finalMessage()) };
  }
```

Add `LlmStreamEvent` to the type import at the top of the file:

```ts
import type {
  LlmContentBlock,
  LlmCreateParams,
  LlmMessage,
  LlmProvider,
  LlmResponse,
  LlmStreamEvent,
  LlmToolCall,
} from '../llm.types';
```

- [ ] **Step 5: Add passthrough on `LlmService`**

In `llm.service.ts`, add to the `LlmService` class (and import the type):

```ts
  streamMessage(params: LlmCreateParams): AsyncIterable<LlmStreamEvent> {
    return this.provider.streamMessage(params);
  }
```

Update its import line to include `LlmStreamEvent`:

```ts
import type {
  LlmCreateParams,
  LlmProvider,
  LlmResponse,
  LlmStreamEvent,
  LlmToolDef,
  SystemPromptContext,
} from './llm.types';
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter finby-api exec jest src/modules/llm/providers/claude.provider.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/llm
git commit -m "feat(llm): add streaming provider method (streamMessage)"
```

---

## Task 2: ChatService streaming generator + handleMessage refactor

This is the highest-blast-radius task. The generator must reproduce the current loop behavior exactly; the existing `handleMessage` tests are the guard.

**Files:**
- Modify: `apps/api/src/modules/chat/chat.types.ts`
- Modify: `apps/api/src/modules/chat/chat.service.ts`
- Modify: `apps/api/src/modules/chat/chat.service.spec.ts`

- [ ] **Step 1: Add the `ChatStreamEvent` type**

In `chat.types.ts`, add after the `ChatResult` interface:

```ts
export type ChatStreamEvent =
  | { type: 'start' }
  | { type: 'text'; text: string }
  | { type: 'action'; action: ChatAction }
  | { type: 'pending'; confirmation: PendingConfirmation }
  | { type: 'done'; message: ChatMessageView }
  | { type: 'error'; code: string; message: string; details?: unknown };
```

- [ ] **Step 2: Migrate the existing test harnesses to mock `streamMessage`**

The loop will call `this.llm.streamMessage` instead of `this.llm.createMessage`. Update `chat.service.spec.ts` so the existing guard tests keep working.

Add these helpers near the top of the file (after the `call(...)` helper):

```ts
import type { LlmResponse, LlmStreamEvent } from '../llm/llm.types';

/** Builds an llm.streamMessage mock that, per call, yields the next response's
 *  text as a single delta then a `complete` event. Extra calls reuse the last. */
function streamOf(...responses: LlmResponse[]): jest.Mock {
  let i = 0;
  return jest.fn().mockImplementation((): AsyncIterable<LlmStreamEvent> => {
    const response = responses[Math.min(i++, responses.length - 1)];
    return (async function* () {
      if (response.textOutput) yield { type: 'text_delta', text: response.textOutput };
      yield { type: 'complete', response };
    })();
  });
}

/** An llm.streamMessage mock whose stream throws when iterated (connection failure). */
function streamThrows(error: Error): jest.Mock {
  return jest.fn().mockImplementation((): AsyncIterable<LlmStreamEvent> => {
    return (async function* () {
      throw error;
    })();
  });
}
```

Then in **each** `build*` helper (`buildForHandle`, `buildForMaintain`, `buildForLoop`, `buildForDedup`), change the `llm` object's field from:

```ts
    const llm = {
      getTools: jest.fn().mockReturnValue([]),
      buildSystemPrompt: jest.fn().mockReturnValue('sys'),
      createMessage,
    };
```

to:

```ts
    const llm = {
      getTools: jest.fn().mockReturnValue([]),
      buildSystemPrompt: jest.fn().mockReturnValue('sys'),
      streamMessage,
    };
```

and rename each helper's parameter `createMessage: jest.Mock` → `streamMessage: jest.Mock` (and the `buildForHandle(createMessage, ...)` signature likewise).

Update the call sites:
- `buildForHandle`'s 429 test: `const streamMessage = jest.fn();` → keep as-is but assert `expect(streamMessage).not.toHaveBeenCalled();`.
- `buildForHandle`'s 503 test: `const createMessage = jest.fn().mockRejectedValue(new Error('credit balance too low'));` → `const streamMessage = streamThrows(new Error('credit balance too low'));`.
- `buildForMaintain` tests: `jest.fn().mockResolvedValue(successResponse)` → `streamOf(successResponse)`.
- `buildForLoop` first test: `jest.fn().mockResolvedValueOnce(A).mockResolvedValueOnce(B).mockResolvedValueOnce(C)` → `streamOf(A, B, C)`; and `expect(createMessage).toHaveBeenCalledTimes(3)` → `expect(streamMessage).toHaveBeenCalledTimes(3)`.
- `buildForLoop` empty-text test: `jest.fn().mockResolvedValueOnce(toolUse(...)).mockResolvedValueOnce(finalText(''))` → `streamOf(toolUse(...), finalText(''))`.
- `buildForDedup` test (lines ~519+): convert its `createMessage` mock the same way with `streamOf(...)`.

Annotate the `toolUse(...)` / `finalText(...)` helpers' return type so `streamOf` accepts them: change `function toolUse(...)` and `function finalText(...)` to return `: LlmResponse` (cast `stopReason` already matches). If TypeScript complains about the literal `content` types, add `as LlmResponse` to the return.

- [ ] **Step 3: Write the new failing event-sequence tests**

Append a new describe block to `chat.service.spec.ts`:

```ts
describe('ChatService.streamMessage — event sequence', () => {
  async function collect(gen: AsyncGenerator<import('./chat.types').ChatStreamEvent>) {
    const events: import('./chat.types').ChatStreamEvent[] = [];
    for await (const e of gen) events.push(e);
    return events;
  }

  it('text-only turn yields start, text, done (no action)', async () => {
    const streamMessage = streamOf({
      stopReason: 'end_turn',
      textOutput: 'You spent $42 this week.',
      content: [{ type: 'text', text: 'You spent $42 this week.' }],
      toolCalls: [],
    } as LlmResponse);
    const { service } = buildForMaintain(streamMessage);

    const events = await collect(service.streamMessage(workspace, 'u1', 'c1', 'how much?'));
    const types = events.map((e) => e.type);

    expect(types[0]).toBe('start');
    expect(types).toContain('text');
    expect(types[types.length - 1]).toBe('done');
    expect(types).not.toContain('action');
  });

  it('a logging turn yields start, action, text, done in order', async () => {
    const streamMessage = streamOf(
      {
        stopReason: 'tool_use',
        textOutput: '',
        content: [{ type: 'tool_use', id: 't1', name: 'log_expense', input: { amountOriginal: '0.21', currencyOriginal: 'USD', categoryName: 'Dining', confidence: 0.95 } }],
        toolCalls: [{ id: 't1', name: 'log_expense', input: { amountOriginal: '0.21', currencyOriginal: 'USD', categoryName: 'Dining', confidence: 0.95 } }],
      } as LlmResponse,
      { stopReason: 'end_turn', textOutput: 'Logged $0.21 for lunch.', content: [{ type: 'text', text: 'Logged $0.21 for lunch.' }], toolCalls: [] } as LlmResponse,
    );
    const { service } = buildForLoop(streamMessage);

    const events = await collect(service.streamMessage(workspace, 'u1', 'c1', 'spent 0.21 on lunch'));
    const types = events.map((e) => e.type);

    expect(types.indexOf('start')).toBeLessThan(types.indexOf('action'));
    expect(types.indexOf('action')).toBeLessThan(types.indexOf('text'));
    expect(types[types.length - 1]).toBe('done');
  });

  it('throws (for the controller to map to 503) when the first turn fails to connect', async () => {
    const streamMessage = streamThrows(new Error('credit balance too low'));
    const { service } = buildForHandle(streamMessage);
    await expect(collect(service.streamMessage(workspace, 'u1', 'c1', 'hi'))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
```

Note: `buildForHandle` / `buildForLoop` / `buildForMaintain` must `return { service, ... }` — they already do.

- [ ] **Step 4: Run to verify the new tests fail (and see which existing tests broke)**

Run: `pnpm --filter finby-api exec jest src/modules/chat/chat.service.spec.ts`
Expected: the new `streamMessage` tests FAIL (`service.streamMessage is not a function`). Existing `handleMessage` tests should still PASS after the Step 2 mock migration — if any fail, that's expected only until Step 5 lands (handleMessage now consumes streamMessage).

- [ ] **Step 5: Implement the generator + refactor `handleMessage`**

In `chat.service.ts`, import the new type and add the generator. Replace the entire body of `handleMessage` (lines ~76–247, from `async handleMessage(` through its closing `}`) with the drain adapter, and add `streamMessage` + a private `runTurn` helper.

Add to the imports from `./chat.types`:

```ts
import type {
  ChatAction,
  ChatResult,
  ChatStreamEvent,
  PendingConfirmation,
  ToolExecResult,
} from './chat.types';
```

Replace `handleMessage` with:

```ts
  /** JSON entry point — drains the streaming generator and assembles the
   *  same ChatResult the non-streaming endpoint has always returned. */
  async handleMessage(
    workspace: WorkspaceContext,
    userId: string,
    conversationId: string,
    content: string,
  ): Promise<ChatResult> {
    const actions: ChatAction[] = [];
    const pendingConfirmations: PendingConfirmation[] = [];
    let message: ChatMessageView | null = null;

    for await (const event of this.streamMessage(workspace, userId, conversationId, content)) {
      if (event.type === 'action') actions.push(event.action);
      else if (event.type === 'pending') pendingConfirmations.push(event.confirmation);
      else if (event.type === 'done') message = event.message;
      // 'text'/'start' deltas are irrelevant to the assembled JSON result;
      // 'error' after a commit is surfaced via the synthesized done message.
    }

    if (!message) {
      // The generator always yields `done` on a completed turn; reaching here
      // means it threw before completing — which the generator already maps to
      // a ServiceUnavailableException, so this is defensive only.
      throw new ServiceUnavailableException(LLM_UNAVAILABLE_MESSAGE);
    }
    return { message, actions, pendingConfirmations };
  }

  /** Streaming entry point and single source of truth for the agentic loop.
   *  Yields start/text/action/pending/done events; throws (pre-stream) on
   *  rate-limit (429) or first-turn connection failure (503). */
  async *streamMessage(
    workspace: WorkspaceContext,
    userId: string,
    conversationId: string,
    content: string,
  ): AsyncGenerator<ChatStreamEvent> {
    const conversation = await this.conversations.requireConversation(
      workspace.id,
      userId,
      conversationId,
    );

    await this.enforceDailyMessageLimit(workspace.tier, workspace.id, userId);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, timezone: true },
    });

    const userMessage = await this.prisma.conversationMessage.create({
      data: { conversationId, role: 'USER', content, tokenCount: estimateTokens(content) },
    });

    const loggedSignatures = await this.loadLoggedSignatures(conversationId, workspace.id);

    const baseSystem = await this.buildSystemPrompt(workspace, user);
    const { system, messages } = await this.contextAssembler.buildContext(conversationId, baseSystem);
    const tools = this.llm.getTools();

    const actions: ChatAction[] = [];
    const convo: LlmMessage[] = [...messages];

    let response: LlmResponse;
    try {
      response = yield* this.runTurn({ system, messages: convo, tools }, true);
    } catch (error) {
      // No tool ran yet — nothing was committed. Degrade gracefully (503).
      await this.persistLlmFailure(conversationId, conversation.title, content);
      this.logger.error(`LLM call failed: ${this.describe(error)}`);
      throw new ServiceUnavailableException(LLM_UNAVAILABLE_MESSAGE);
    }
    let finalText = response.textOutput;

    for (let round = 0; round < MAX_TOOL_ROUNDS && response.toolCalls.length > 0; round += 1) {
      const toolResultBlocks: LlmContentBlock[] = [];
      for (const call of response.toolCalls) {
        const signature = this.logSignature(call);

        await this.prisma.conversationMessage.create({
          data: {
            conversationId,
            role: 'TOOL_CALL',
            content: JSON.stringify(call.input),
            toolName: call.name,
            tokenCount: estimateTokens(JSON.stringify(call.input)),
          },
        });

        if (signature && loggedSignatures.has(signature)) {
          const dupResult = JSON.stringify({
            status: 'duplicate_skipped',
            message:
              'That event was already logged earlier in this conversation — not logging it again.',
          });
          await this.prisma.conversationMessage.create({
            data: {
              conversationId,
              role: 'TOOL_RESULT',
              content: dupResult,
              toolResult: dupResult,
              tokenCount: estimateTokens(dupResult),
            },
          });
          toolResultBlocks.push({ type: 'tool_result', toolUseId: call.id, content: dupResult });
          continue;
        }

        const exec = await this.executeTool(workspace, userId, call, userMessage.id);

        await this.prisma.conversationMessage.create({
          data: {
            conversationId,
            role: 'TOOL_RESULT',
            content: exec.toolResult,
            toolResult: exec.toolResult,
            tokenCount: estimateTokens(exec.toolResult),
            ...(exec.action?.type === 'TRANSACTION_CREATED' ? { createdTransactionId: exec.action.transactionId } : {}),
          },
        });

        if (exec.action) {
          actions.push(exec.action);
          if (signature) loggedSignatures.add(signature);
          yield { type: 'action', action: exec.action };
        }
        if (exec.pending) {
          yield { type: 'pending', confirmation: exec.pending };
        }
        toolResultBlocks.push({
          type: 'tool_result',
          toolUseId: call.id,
          content: exec.toolResult,
        });
      }

      convo.push({ role: 'assistant', content: response.content });
      convo.push({ role: 'user', content: toolResultBlocks });

      try {
        response = yield* this.runTurn({ system, messages: convo, tools }, false);
      } catch (error) {
        // Tools already executed — don't lose the action. Synthesize a summary
        // and surface a non-fatal error event (headers are already sent).
        this.logger.error(`LLM follow-up failed after tool execution: ${this.describe(error)}`);
        finalText = this.fallbackSummary(actions);
        yield { type: 'error', code: 'LLM_FOLLOWUP_FAILED', message: LLM_UNAVAILABLE_MESSAGE };
        response = { stopReason: 'error', content: [], textOutput: '', toolCalls: [] };
        break;
      }
      finalText = response.textOutput || finalText;
    }

    if (!finalText.trim()) {
      finalText = this.fallbackSummary(actions);
    }

    const assistant = await this.prisma.conversationMessage.create({
      data: { conversationId, role: 'ASSISTANT', content: finalText, tokenCount: estimateTokens(finalText) },
    });

    const messageCount = await this.prisma.conversationMessage.count({ where: { conversationId } });
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        messageCount,
        title: conversation.title ?? content.slice(0, 50),
        updatedAt: new Date(),
      },
    });

    if (workspace.tier === 'FREE') {
      await this.memory.maintain(conversationId, workspace.tier);
    } else {
      void this.memory.maintain(conversationId, workspace.tier).catch((err) =>
        this.logger.warn(`Background memory maintain failed: ${String(err)}`),
      );
    }

    yield {
      type: 'done',
      message: {
        id: assistant.id,
        role: 'ASSISTANT',
        content: finalText,
        createdAt: assistant.createdAt.toISOString(),
      },
    };
  }

  /** Runs a single LLM turn: forwards text deltas as `text` events (emitting a
   *  one-time `start` first when requested) and returns the assembled response. */
  private async *runTurn(
    params: { system: string; messages: LlmMessage[]; tools: ReturnType<LlmService['getTools']> },
    emitStart: boolean,
  ): AsyncGenerator<ChatStreamEvent, LlmResponse> {
    let started = false;
    let response: LlmResponse | undefined;
    for await (const ev of this.llm.streamMessage(params)) {
      if (!started) {
        started = true;
        if (emitStart) yield { type: 'start' };
      }
      if (ev.type === 'text_delta') {
        if (ev.text) yield { type: 'text', text: ev.text };
      } else if (ev.type === 'complete') {
        response = ev.response;
      }
    }
    if (!response) {
      throw new Error('LLM stream ended without a completion event');
    }
    return response;
  }
```

Add `ChatMessageView` to the `./chat.types` import if not already imported (it is used by the new `message` local). Confirm the top-of-file imports include `ChatMessageView`:

```ts
import type {
  ChatAction,
  ChatMessageView,
  ChatResult,
  ChatStreamEvent,
  PendingConfirmation,
  ToolExecResult,
} from './chat.types';
```

- [ ] **Step 6: Run the whole chat spec**

Run: `pnpm --filter finby-api exec jest src/modules/chat/chat.service.spec.ts`
Expected: PASS — all existing `handleMessage` guard tests (multi-step loop, 429, 503, memory tier, dedup, empty-text) **and** the new `streamMessage` event-sequence tests.

- [ ] **Step 7: Typecheck the API**

Run: `pnpm --filter finby-api typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/chat/chat.types.ts apps/api/src/modules/chat/chat.service.ts apps/api/src/modules/chat/chat.service.spec.ts
git commit -m "feat(chat): stream the agentic loop via streamMessage generator"
```

---

## Task 3: SSE controller endpoint

**Files:**
- Modify: `apps/api/src/modules/chat/conversations.controller.ts`
- Test: `apps/api/src/modules/chat/conversations.controller.spec.ts` (create)

- [ ] **Step 1: Write the failing controller test**

Create `apps/api/src/modules/chat/conversations.controller.spec.ts`:

```ts
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
      // eslint-disable-next-line no-unreachable
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter finby-api exec jest src/modules/chat/conversations.controller.spec.ts`
Expected: FAIL — `controller.stream is not a function`.

- [ ] **Step 3: Implement the SSE endpoint**

In `conversations.controller.ts`, add imports:

```ts
import { Res } from '@nestjs/common';
import type { Response } from 'express';
import type { ChatStreamEvent, ChatResult } from './chat.types';
```

(Keep the existing `ChatMessageView, ChatResult` import — merge `ChatStreamEvent` into it rather than duplicating.)

Add this method to the `ConversationsController` class, after `send`:

```ts
  @Post(':conversationId/messages/stream')
  @Roles('OWNER', 'CO_MANAGER')
  @UseGuards(RolesGuard)
  async stream(
    @Workspace() workspace: WorkspaceContext,
    @CurrentUser() user: AuthUser,
    @Param('conversationId') conversationId: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessageInput,
    @Res() res: Response,
  ): Promise<void> {
    const gen = this.chat.streamMessage(workspace, user.userId, conversationId, body.content);

    // Peek the first event BEFORE touching the response. Pre-stream failures
    // (rate-limit 429, LLM-unreachable 503, validation already handled) throw
    // here with the response untouched, so the global HttpExceptionFilter emits
    // a proper JSON error status.
    const first = await gen.next();

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const heartbeat = setInterval(() => res.write(':ping\n\n'), 15000);
    const frame = (event: ChatStreamEvent): string =>
      `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

    try {
      if (!first.done) res.write(frame(first.value));
      for await (const event of gen) res.write(frame(event));
    } catch {
      // Headers are already sent — deliver failures as an in-stream error event.
      res.write(
        `event: error\ndata: ${JSON.stringify({ code: 'STREAM_FAILED', message: 'The response was interrupted. Please try again.' })}\n\n`,
      );
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter finby-api exec jest src/modules/chat/conversations.controller.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter finby-api typecheck`
Expected: no errors. (If `express` types are missing, add `@types/express` — it ships with `@nestjs/platform-express`, so it should resolve.)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/chat/conversations.controller.ts apps/api/src/modules/chat/conversations.controller.spec.ts
git commit -m "feat(chat): add SSE streaming endpoint POST /messages/stream"
```

---

## Task 4: Frontend SSE parser + auth-aware stream fetch + client

**Files:**
- Create: `apps/web/src/lib/sse.ts`
- Test: `apps/web/src/lib/sse.test.ts`
- Modify: `apps/web/src/lib/store.ts`
- Modify: `apps/web/src/lib/types.ts`
- Modify: `apps/web/src/lib/chat-api.ts`

- [ ] **Step 1: Write the failing SSE parser test**

Create `apps/web/src/lib/sse.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseSseFrames } from './sse';

describe('parseSseFrames', () => {
  it('parses a complete frame and returns no remainder', () => {
    const { events, rest } = parseSseFrames('event: text\ndata: {"text":"hi"}\n\n');
    expect(events).toEqual([{ event: 'text', data: '{"text":"hi"}' }]);
    expect(rest).toBe('');
  });

  it('parses multiple frames in one chunk', () => {
    const { events } = parseSseFrames('event: start\ndata: {}\n\nevent: done\ndata: {"id":1}\n\n');
    expect(events.map((e) => e.event)).toEqual(['start', 'done']);
  });

  it('buffers a partial frame as remainder', () => {
    const { events, rest } = parseSseFrames('event: text\ndata: {"text":"par');
    expect(events).toEqual([]);
    expect(rest).toBe('event: text\ndata: {"text":"par');
  });

  it('ignores heartbeat comment lines', () => {
    const { events } = parseSseFrames(':ping\n\nevent: text\ndata: {}\n\n');
    expect(events.map((e) => e.event)).toEqual(['text']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter finby-web exec vitest run src/lib/sse.test.ts`
Expected: FAIL — cannot resolve `./sse`.

- [ ] **Step 3: Implement the parser**

Create `apps/web/src/lib/sse.ts`:

```ts
export interface ParsedSseEvent {
  event: string;
  data: string;
}

/** Splits an accumulating SSE buffer into complete events (delimited by a blank
 *  line) and the leftover partial frame. Comment lines (starting with ':',
 *  e.g. heartbeats) are skipped. */
export function parseSseFrames(buffer: string): { events: ParsedSseEvent[]; rest: string } {
  const events: ParsedSseEvent[] = [];
  let rest = buffer;
  let idx: number;
  while ((idx = rest.indexOf('\n\n')) !== -1) {
    const raw = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    if (raw.startsWith(':')) continue; // heartbeat / comment

    let event = 'message';
    const dataLines: string[] = [];
    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
    }
    if (dataLines.length > 0) events.push({ event, data: dataLines.join('\n') });
  }
  return { events, rest };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter finby-web exec vitest run src/lib/sse.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add `authedStream` to the store**

In `store.ts`, update the api-client import:

```ts
import { API_BASE, ApiError, apiFetch } from './api-client';
```

Add to the `AuthState` interface (near `authed`):

```ts
  authedStream: (path: string, init?: RequestInit) => Promise<Response>;
```

Add the implementation in the store factory, right after the `authed:` method:

```ts
      authedStream: async (path, init = {}): Promise<Response> => {
        const run = async (token: string | null): Promise<Response> =>
          fetch(`${API_BASE}${path}`, {
            ...init,
            headers: {
              'Content-Type': 'application/json',
              ...(init.headers ?? {}),
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          });

        let res: Response;
        try {
          res = await run(get().accessToken);
        } catch {
          throw new ApiError(0, 'NETWORK', "We couldn't reach Finby. Please check your connection and try again.");
        }

        if (res.status === 401 && get().refreshToken) {
          const refreshed = await get().tryRefresh();
          if (refreshed) res = await run(get().accessToken);
        }

        if (!res.ok) {
          const text = await res.text();
          const body = (text ? JSON.parse(text) : {}) as { error?: string; message?: string; details?: unknown };
          throw new ApiError(
            res.status,
            body.error ?? 'ERROR',
            body.message ?? 'Something went wrong. Please try again.',
            body.details,
          );
        }
        return res;
      },
```

- [ ] **Step 6: Add stream handler types**

In `types.ts`, add (near the existing `ChatResult` / `ChatAction` types):

```ts
export interface ChatStreamHandlers {
  onText: (text: string) => void;
  onAction: (action: ChatAction) => void;
  onPending: (confirmation: PendingConfirmation) => void;
  onDone: (message: ChatMessageView) => void;
  onError: (error: { code: string; message: string; details?: unknown }) => void;
}
```

If `ChatMessageView` is not already exported from `types.ts`, add:

```ts
export interface ChatMessageView {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}
```

(Reuse the existing `ChatAction` / `PendingConfirmation` types already in this file — do not redefine them.)

- [ ] **Step 7: Add the `streamMessage` client**

In `chat-api.ts`, add the import:

```ts
import { parseSseFrames } from './sse';
import type { ChatStreamHandlers } from './types';
```

Add the function:

```ts
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
```

Add `ChatAction, PendingConfirmation, ChatMessageView` to the existing type import in `chat-api.ts` (it already imports from `./types`).

- [ ] **Step 8: Typecheck the web app**

Run: `pnpm --filter finby-web typecheck`
Expected: no errors.

- [ ] **Step 9: Run the parser test again + commit**

Run: `pnpm --filter finby-web exec vitest run src/lib/sse.test.ts`
Expected: PASS.

```bash
git add apps/web/src/lib/sse.ts apps/web/src/lib/sse.test.ts apps/web/src/lib/store.ts apps/web/src/lib/types.ts apps/web/src/lib/chat-api.ts
git commit -m "feat(web): SSE parser, authedStream, and streamMessage client"
```

---

## Task 5: Wire the chat page to streaming

**Files:**
- Modify: `apps/web/src/app/(app)/chat/page.tsx`

- [ ] **Step 1: Swap the import**

In `chat/page.tsx`, change the `chat-api` import to use `streamMessage` instead of `sendMessage`:

```ts
import {
  appendAssistantNote,
  createConversation,
  listConversations,
  listMessages,
  streamMessage,
} from '@/lib/chat-api';
```

- [ ] **Step 2: Replace `handleSend` with the streaming version**

Replace the entire `handleSend` function with:

```ts
  async function handleSend(content: string) {
    if (!workspace || !conversationId || sending) return;
    setNotice(null);
    const assistantId = genId();
    setMessages((m) => [
      ...m,
      { id: genId(), role: 'USER', content, createdAt: new Date().toISOString() },
      { id: assistantId, role: 'ASSISTANT', content: '', createdAt: new Date().toISOString(), actions: [], confirmations: [] },
    ]);
    setSending(true);
    track('chat_message_sent');

    const patch = (fn: (msg: UiMessage) => UiMessage) =>
      setMessages((m) => m.map((msg) => (msg.id === assistantId ? fn(msg) : msg)));

    try {
      await streamMessage(workspace.id, conversationId, content, {
        onText: (text) => patch((msg) => ({ ...msg, content: msg.content + text })),
        onAction: (a) => {
          patch((msg) => ({ ...msg, actions: [...(msg.actions ?? []), a] }));
          if (a.type === 'TRANSACTION_CREATED') {
            track('transaction_logged', { tx_type: a.txType, currency: a.preview.currency });
            if (a.currentStreak != null) {
              setUser({
                currentStreak: a.currentStreak,
                longestStreak: Math.max(user?.longestStreak ?? 0, a.currentStreak),
              });
            }
          } else if (a.type === 'BUDGET_SET') {
            track('budget_set', { currency: a.preview.currency });
          }
        },
        onPending: (c) => patch((msg) => ({ ...msg, confirmations: [...(msg.confirmations ?? []), c] })),
        onDone: (message) =>
          patch((msg) => ({ ...msg, id: message.id, createdAt: message.createdAt })),
        onError: (e) => {
          // Tools may have already committed and streamed their action cards;
          // keep them and ensure the bubble isn't left empty.
          patch((msg) => ({ ...msg, content: msg.content || e.message }));
          setNotice({ kind: 'down', message: e.message });
        },
      });
    } catch (err) {
      // Pre-stream failure (429/503/400) — drop the empty placeholder bubble.
      setMessages((m) => m.filter((msg) => msg.id !== assistantId));
      handleError(err);
    } finally {
      setSending(false);
    }
  }
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter finby-web typecheck`
Expected: no errors. (If `sendMessage` is now unused elsewhere, that's fine — it remains exported for the JSON fallback; do not delete it.)

- [ ] **Step 4: Run the web test suite**

Run: `pnpm --filter finby-web test`
Expected: PASS. If a `chat/page` or `composer` test referenced `sendMessage` directly, update its mock to `streamMessage` (mock it to invoke `handlers.onText`/`onDone`) — show the mock inline rather than leaving it stubbed.

- [ ] **Step 5: Commit**

```bash
git add 'apps/web/src/app/(app)/chat/page.tsx'
git commit -m "feat(web): stream assistant replies into the chat view"
```

---

## Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: API — full test + typecheck + lint + build**

```bash
pnpm --filter finby-api test
pnpm --filter finby-api typecheck
pnpm --filter finby-api lint
pnpm --filter finby-api build
```
Expected: all green.

- [ ] **Step 2: Web — full test + typecheck + build**

```bash
pnpm --filter finby-web test
pnpm --filter finby-web typecheck
pnpm --filter finby-web build
```
Expected: all green.

- [ ] **Step 3: Manual smoke test (local)**

Start the API and web (per `docs/DEPLOY.md` / local dev). With Postgres on `:5434` and Redis on `:6380`:
- Ask a question ("how much did I spend this week?") → reply text should type in progressively.
- Log a transaction ("spent 12 on coffee") → the action card + streak should appear before/while the confirmation text streams.
- Verify the daily-limit path still returns a 429 upgrade notice (e.g. by temporarily lowering the FREE cap or exhausting it) and that an LLM error renders the "down" notice.

Expected: streaming visible; action card appears at commit; 429/503 still render correct notices.

- [ ] **Step 4: Final commit (if manual testing required any fixes)**

```bash
git add -A
git commit -m "test(chat): verify streaming end-to-end"
```

---

## Self-Review notes (author)

- **Spec coverage:** provider streaming (Task 1) ✓; unify loop + generator (Task 2) ✓; SSE endpoint + HTTP-vs-in-stream error split (Task 3) ✓; auth-aware fetch + parser + client (Task 4) ✓; page wiring + action-on-commit (Task 5) ✓; tests for question/log/follow-up-failure + refactor guard (Tasks 2–4) ✓; manual 429/503 check (Task 6) ✓.
- **Out of scope (unchanged):** cancel button, region migration, streaming the silent tool-selection turn.
- **Type consistency:** `LlmStreamEvent` (text_delta|complete), `ChatStreamEvent` (start|text|action|pending|done|error), and `ChatStreamHandlers` (onText/onAction/onPending/onDone/onError) are used identically across api + web.
