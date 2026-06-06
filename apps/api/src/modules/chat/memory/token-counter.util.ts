/** Rough token estimate. Replace with @anthropic-ai/tokenizer if precision is
 *  ever needed; ~4 chars/token is close enough for budget thresholds. */
export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
