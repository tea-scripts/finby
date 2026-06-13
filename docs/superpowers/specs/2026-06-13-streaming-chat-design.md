# Streaming Chat Responses — Design

**Date:** 2026-06-13
**Status:** Approved (design)
**Author:** Tea + Claude

## Problem

A chat turn (logging a transaction or asking Finby a question) currently returns
as a single blocking JSON response. The user waits for the **entire** agentic
loop to finish — multiple sequential DB queries plus two sequential, non-streamed
Claude Sonnet generations — before seeing a single character. Total latency
(~5–10s) equals perceived latency.

Evidence (traced in code):
- Backend uses `client.messages.create()` (blocking) in
  `apps/api/src/modules/llm/providers/claude.provider.ts`.
- Frontend `await`s the full JSON in `apps/web/src/lib/chat-api.ts` (`sendMessage`);
  no `EventSource` / `ReadableStream` anywhere in the web app.
- The agentic loop in `apps/api/src/modules/chat/chat.service.ts` makes 2+
  sequential LLM calls for any tool use (call #1 picks a tool, tool commits,
  call #2 writes the reply).

## Goal

Convert the chat reply into a **Server-Sent Events (SSE)** stream so that:
1. The assistant's reply text types in live (first token visible in ~1s for
   text-only turns).
2. Action cards (transaction logged + streak, budget set, etc.) appear the
   instant the underlying tool commits — roughly one LLM-call sooner than today
   for the common "logging" case.

Total wall-clock time is largely unchanged; **perceived** latency drops sharply.

## Non-goals (YAGNI)

- Stop / cancel-generation button (AbortController plumbing can be added later).
- Streaming the silent tool-selection turn's intermediate text.
- DB region migration / Accelerate changes (separate performance item — Render
  is in Oregon, the Prisma Postgres DB is likely `us-east-1`; co-location is
  tracked independently).

## Key structural decision: unify the agentic loop

The loop handles **financial writes and dedup** and must not exist in two
copies that can drift. Therefore:

- `ChatService.streamMessage()` (async generator) becomes the **single source of
  truth** for the agentic loop.
- `ChatService.handleMessage()` (existing JSON entry point) is rewritten as a
  thin adapter that **drains** `streamMessage()`, concatenates text deltas, and
  collects actions / pending confirmations into the same `ChatResult` shape it
  returns today.
- The existing `chat.service.spec.ts` guards that the JSON path stays
  behavior-identical (same persistence, same 429/503 semantics, same assembled
  text and actions).

Rationale: avoids duplicating complex, money-touching logic; the JSON endpoint
becomes a trivial adapter.

## Components & changes

### Backend

**1. LLM provider port — add streaming**
`LlmProvider` (`llm.types.ts`) gains:

```ts
streamMessage(params: LlmCreateParams): AsyncIterable<LlmStreamEvent>;
```

where

```ts
type LlmStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'complete'; response: LlmResponse };
```

`ClaudeProvider` implements it via `this.client.messages.stream(...)`, forwarding
`text` deltas as `text_delta` and emitting a terminal `complete` carrying the
fully assembled `LlmResponse` (content / textOutput / toolCalls / stopReason —
same shape `createMessage` returns today). `createMessage()` stays unchanged
(receipt extraction and any non-chat caller keep using it).

**2. `ChatService.streamMessage()` — async generator**
Mirrors the current `handleMessage` loop but yields a discriminated union of
chat-level events:

```ts
type ChatStreamEvent =
  | { type: 'start' }
  | { type: 'text'; text: string }
  | { type: 'action'; action: ChatAction }
  | { type: 'pending'; confirmation: PendingConfirmation }
  | { type: 'done'; message: ChatMessageView }
  | { type: 'error'; code: string; message: string; details?: unknown };
```

- Same pre-flight as today: `requireConversation`, `enforceDailyMessageLimit`,
  persist the user message, build system prompt + context.
- `start` is yielded after pre-flight succeeds (rate-limit passed, user message
  persisted) **and** the first LLM turn has connected.
- For each LLM turn, iterate the provider's `streamMessage`; forward `text_delta`
  as `text` events; on `complete`, continue the loop with the assembled
  `LlmResponse` exactly as the current loop does.
- After each tool commit, yield an `action` (or `pending`) event immediately.
- On loop end, persist the assistant message (as today) and yield `done` with the
  persisted id + createdAt.
- A follow-up LLM failure **after** tools have committed yields `error` and the
  client renders the existing `fallbackSummary` text; the committed actions stay.

**3. Controller — new SSE endpoint**
`POST /workspaces/:workspaceId/conversations/:conversationId/messages/stream`,
same guards (`WorkspaceMemberGuard`, `RolesGuard` OWNER/CO_MANAGER) and Zod body
(`sendMessageSchema`) as the existing `send`. Uses the raw Express response
(`@Res()`):

- Pull events from the generator. Failures that occur **before** the stream
  connects propagate as normal HTTP errors via the existing exception filter:
  rate limit → **429** (`{ upgradeRequired: true }`), LLM unreachable → **503**,
  validation → **400**.
- Once the first LLM turn connects, write `200` + SSE headers and flush events.
  From that point, failures are delivered as in-stream `error` events (headers
  are already sent — HTTP status can no longer change).

**4. SSE wire format**

Headers:
```
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```
Frames: `event: <type>\n` + `data: <json>\n\n`. Event types: `start`, `text`,
`action`, `pending`, `done`, `error`. A `:ping\n\n` comment heartbeat (~15s)
keeps the connection alive during long tool chains. (The web client hits
`api.finby.app` directly — no Vercel function in the path — so proxy buffering
risk is low; headers + heartbeat are defensive.)

### Frontend

**5. Auth-compatible streaming fetch**
Add `authedStream(path, init): Promise<Response>` to the store (`lib/store.ts`),
reusing the existing bearer-token + refresh-once-on-401 logic from `authed()` but
returning the raw `Response` (so the body can be streamed). `EventSource` is not
usable — it cannot set the `Authorization` header or POST a body.

**6. SSE client + parser**
In `lib/chat-api.ts`, add `streamMessage(workspaceId, conversationId, content,
handlers)` that calls `authedStream(...)`, then reads `response.body.getReader()`,
decodes chunks, and feeds them through a small SSE frame parser (buffers partial
frames split across chunks; supports multiple events per chunk). Dispatches to
`handlers.onText / onAction / onPending / onDone / onError`. Pre-stream HTTP
errors (429/503/400) are thrown as `ApiError` before any handler fires, so the
existing error path is reused verbatim.

**7. Chat page wiring**
`apps/web/src/app/(app)/chat/page.tsx` `handleSend`:
- Insert an empty assistant `UiMessage` placeholder.
- `onText`: append the delta to the placeholder's `content`.
- `onAction`: attach to the placeholder's `actions`, and fire the existing
  `track()` / streak-update side effects (currently in the post-response loop).
- `onPending`: attach to `confirmations`.
- `onDone`: set the real message `id` + `createdAt`.
- `onError`: route through the existing `handleError` (maps codes → `Notice`).
- `sending` stays true until `done`/`error`. `TypingDots` shows until the first
  `text` delta arrives.

### Types

`ChatStreamEvent` is defined in `apps/api/src/modules/chat/chat.types.ts` and
mirrored in `apps/web/src/lib/types.ts`, following the existing convention
(`ChatResult` is already duplicated across the two).

## Data flow — transaction log example

1. Client POSTs to `/messages/stream`.
2. Server: lookup conversation, rate-limit check, persist user message.
   (Rate limit exceeded → HTTP **429**, no stream.)
3. First LLM turn connects → SSE headers sent → `start`. Model returns a
   `tool_use` (`log_expense`), no text.
4. Server executes the tool → transaction committed → `action`
   (`TRANSACTION_CREATED` + streak) → client pops the action card + updates
   streak immediately.
5. Second LLM turn streams text deltas ("Done — logged $12 for coffee ☕") →
   `text` events → client types them into the assistant bubble.
6. Server persists the assistant message → `done` (id, createdAt) → client
   finalizes the bubble. Stream closes.

## Error handling

| Failure | Delivery | Client behavior |
|---|---|---|
| Daily message limit | HTTP 429 (`upgradeRequired`) before stream | Upgrade CTA (unchanged) |
| LLM unreachable on first connect | HTTP 503 before stream | "Down" notice (unchanged) |
| Invalid body | HTTP 400 before stream | Error notice (unchanged) |
| LLM follow-up fails after a tool committed | in-stream `error` | Keep action cards; render `fallbackSummary` text |
| Client network drop mid-stream | reader throws | Transient error notice; assistant message persisted server-side iff loop completed — a refresh reconciles |
| Long tool chain idle | `:ping` heartbeat | Connection stays open |

## Testing

**API**
- Extend `chat.service.spec.ts`:
  - Plain question → `start → text… → done` (no `action`).
  - Transaction log → `start → action → text… → done`.
  - Follow-up LLM failure after a commit → `action → error` (+ fallback text).
  - **Refactor guard:** `handleMessage` (draining the generator) returns a
    `ChatResult` identical to the pre-refactor expectations.
  - Mock the provider's `streamMessage`.
- Provider unit test: Anthropic stream events → `text_delta` sequence + assembled
  `LlmResponse` (mock the SDK stream).

**Web**
- SSE frame parser: partial frames across chunks, multiple events per chunk,
  comment/heartbeat lines ignored.
- `streamMessage` handler dispatch against a mocked `Response` with a
  `ReadableStream` body.
- Update affected `chat/page.tsx` / composer tests.

**Manual**
- Real turn: text streams in; action card pops before the text for a log.
- 429 (hit daily limit) and 503 (LLM down) still render the correct notices.
