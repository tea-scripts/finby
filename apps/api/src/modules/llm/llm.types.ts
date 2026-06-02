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

export type LlmContentBlock =
  | { type: 'text'; text: string }
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

export interface LlmCreateParams {
  system: string;
  messages: LlmMessage[];
  tools?: LlmToolDef[];
  maxTokens?: number;
}

/** Provider-agnostic LLM port. The ONLY Anthropic-specific code is claude.provider.ts. */
export interface LlmProvider {
  createMessage(params: LlmCreateParams): Promise<LlmResponse>;
}

export interface SystemPromptContext {
  user: { displayName: string; timezone: string };
  workspace: { baseCurrency: string; tier: string };
  accounts: Array<{ name: string; currency: string }>;
  categories: string[];
  today: string;
  rollingContextSummary?: string | null;
}
