export interface TranscriptMessage {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'TOOL_CALL' | 'TOOL_RESULT';
  toolName: string | null;
  createdTransactionId: string | null;
  createdAt: Date;
}

export interface DroppedTurn {
  userMessageId: string;
}

const LOG_TOOLS = new Set(['log_expense', 'log_income', 'log_transfer']);

/** Split an ordered transcript into turns (USER → next USER) and return turns
 *  with no successful logging tool call. Reconstruction (LLM replay) is the real
 *  "was this a logging intent?" filter; this just finds turns that produced no
 *  saved transaction. */
export function detectDroppedTurns(
  messages: TranscriptMessage[],
  opts: { alreadyRecoveredUserMessageIds: Set<string> },
): DroppedTurn[] {
  const ordered = [...messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const dropped: DroppedTurn[] = [];

  let i = 0;
  while (i < ordered.length) {
    if (ordered[i]!.role !== 'USER') {
      i += 1;
      continue;
    }
    const userMsg = ordered[i]!;
    let j = i + 1;
    let loggedOk = false;
    let pendingLogCall = false;
    while (j < ordered.length && ordered[j]!.role !== 'USER') {
      const m = ordered[j]!;
      if (m.role === 'TOOL_CALL' && m.toolName && LOG_TOOLS.has(m.toolName)) {
        pendingLogCall = true;
      } else if (m.role === 'TOOL_RESULT') {
        if (pendingLogCall && m.createdTransactionId) {
          loggedOk = true;
        }
        pendingLogCall = false;
      }
      j += 1;
    }
    if (!loggedOk && !opts.alreadyRecoveredUserMessageIds.has(userMsg.id)) {
      dropped.push({ userMessageId: userMsg.id });
    }
    i = j;
  }
  return dropped;
}
