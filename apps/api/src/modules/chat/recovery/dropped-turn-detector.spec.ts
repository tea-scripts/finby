import { detectDroppedTurns, type TranscriptMessage } from './dropped-turn-detector';

const t = (over: Partial<TranscriptMessage>): TranscriptMessage => ({
  id: 'm', role: 'USER', toolName: null, createdTransactionId: null,
  createdAt: new Date('2026-06-18T10:00:00Z'), ...over,
});

describe('detectDroppedTurns', () => {
  it('flags a USER→ASSISTANT turn with no successful log tool call', () => {
    const msgs = [
      t({ id: 'u1', role: 'USER' }),
      t({ id: 'a1', role: 'ASSISTANT' }), // "Logged! ..."
    ];
    const out = detectDroppedTurns(msgs, { alreadyRecoveredUserMessageIds: new Set() });
    expect(out).toEqual([{ userMessageId: 'u1' }]);
  });

  it('does NOT flag a turn where a log tool created a transaction', () => {
    const msgs = [
      t({ id: 'u1', role: 'USER' }),
      t({ id: 'c1', role: 'TOOL_CALL', toolName: 'log_expense' }),
      t({ id: 'r1', role: 'TOOL_RESULT', createdTransactionId: 'tx1' }),
      t({ id: 'a1', role: 'ASSISTANT' }),
    ];
    expect(detectDroppedTurns(msgs, { alreadyRecoveredUserMessageIds: new Set() })).toEqual([]);
  });

  it('flags a turn where the log tool call FAILED (no createdTransactionId)', () => {
    const msgs = [
      t({ id: 'u1', role: 'USER' }),
      t({ id: 'c1', role: 'TOOL_CALL', toolName: 'log_expense' }),
      t({ id: 'r1', role: 'TOOL_RESULT', createdTransactionId: null }),
      t({ id: 'a1', role: 'ASSISTANT' }),
    ];
    expect(detectDroppedTurns(msgs, { alreadyRecoveredUserMessageIds: new Set() }))
      .toEqual([{ userMessageId: 'u1' }]);
  });

  it('skips already-recovered user messages', () => {
    const msgs = [t({ id: 'u1', role: 'USER' }), t({ id: 'a1', role: 'ASSISTANT' })];
    const out = detectDroppedTurns(msgs, {
      alreadyRecoveredUserMessageIds: new Set(['u1']),
    });
    expect(out).toEqual([]);
  });

  it('handles multiple turns independently', () => {
    const msgs = [
      t({ id: 'u1', role: 'USER' }),
      t({ id: 'c1', role: 'TOOL_CALL', toolName: 'log_expense' }),
      t({ id: 'r1', role: 'TOOL_RESULT', createdTransactionId: 'tx1' }), // logged ok
      t({ id: 'u2', role: 'USER' }),
      t({ id: 'a2', role: 'ASSISTANT' }),                                // dropped
    ];
    expect(detectDroppedTurns(msgs, { alreadyRecoveredUserMessageIds: new Set() }))
      .toEqual([{ userMessageId: 'u2' }]);
  });

  it('flags a turn where a NON-logging tool produced a createdTransactionId', () => {
    const msgs = [
      t({ id: 'u1', role: 'USER' }),
      t({ id: 'c1', role: 'TOOL_CALL', toolName: 'get_balance' }),
      t({ id: 'r1', role: 'TOOL_RESULT', createdTransactionId: 'tx1' }),
      t({ id: 'a1', role: 'ASSISTANT' }),
    ];
    expect(detectDroppedTurns(msgs, { alreadyRecoveredUserMessageIds: new Set() }))
      .toEqual([{ userMessageId: 'u1' }]);
  });
});
