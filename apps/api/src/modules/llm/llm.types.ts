export interface LlmToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface LlmToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** Image formats accepted by the vision API (HEIC is not supported — callers
 *  must transcode or degrade gracefully before reaching the provider). */
export type LlmImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

export type LlmContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { base64: string; mediaType: LlmImageMediaType } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolUseId: string; content: string; isError?: boolean };

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string | LlmContentBlock[];
}

export interface LlmResponse {
  stopReason: string | null;
  content: LlmContentBlock[];
  textOutput: string;
  toolCalls: LlmToolCall[];
}

export type LlmStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'complete'; response: LlmResponse };

export interface LlmCreateParams {
  system: string;
  messages: LlmMessage[];
  tools?: LlmToolDef[];
  maxTokens?: number;
  /** Override the env-configured model for this call (e.g. receipt extraction
   *  must always use claude-sonnet-4-6 regardless of the chat default). */
  model?: string;
}

/** Provider-agnostic LLM port. The ONLY Anthropic-specific code is claude.provider.ts. */
export interface LlmProvider {
  createMessage(params: LlmCreateParams): Promise<LlmResponse>;
  /** Streams text deltas as they arrive, then emits a terminal `complete`
   *  event carrying the fully assembled response (same shape as createMessage). */
  streamMessage(params: LlmCreateParams): AsyncIterable<LlmStreamEvent>;
}

export interface SystemPromptContext {
  user: { displayName: string; timezone: string };
  workspace: { baseCurrency: string; tier: string };
  accounts: Array<{ name: string; currency: string }>;
  categories: string[];
  budgets: Array<{ category: string; spent: string; limit: string; utilizationPercent: number }>;
  today: string;
  rollingContextSummary?: string | null;
}
