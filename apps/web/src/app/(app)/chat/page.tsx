'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { ActionCard } from '@/components/chat/action-card';
import { Composer } from '@/components/chat/composer';
import { ConfirmationCard } from '@/components/chat/confirmation-card';
import { MessageBubble } from '@/components/chat/message-bubble';
import { TypingDots } from '@/components/chat/typing-dots';
import { ReceiptScanner } from '@/components/receipts/ReceiptScanner';
import { UpgradeModal } from '@/components/billing/UpgradeModal';
import { StreakStartPrompt } from '@/components/streak/StreakStartPrompt';
import { shouldPromptStreakStart, STREAK_START_SHOWN_KEY } from '@/lib/streak-start';
import { getPushState } from '@/lib/push';
import { Button } from '@/components/ui/button';
import { Lottie } from '@/components/ui/lottie';
import { Modal } from '@/components/ui/modal';
import { ApiError } from '@/lib/api-client';
import { dayKey, dayLabel } from '@/lib/format';
import { createTypewriter } from '@/lib/typewriter';
import {
  appendAssistantNote,
  createConversation,
  listConversations,
  listMessages,
  streamMessage,
} from '@/lib/chat-api';
import { useAuth } from '@/lib/store';
import { track } from '@/lib/analytics';
import type {
  ChatAction,
  ChatMessageView,
  PendingConfirmation,
  ReceiptExtraction,
  Transaction,
} from '@/lib/types';

interface UiMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  actions?: ChatAction[];
  confirmations?: PendingConfirmation[];
}

type Notice = { kind: 'limit' | 'down' | 'error'; message: string; upgrade?: boolean } | null;

function genId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `tmp-${Math.random().toString(36).slice(2)}`;
  }
}

export default function ChatPage() {
  const workspace = useAuth((s) => s.workspace);
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const refreshUser = useAuth((s) => s.refreshUser);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [streakStartOpen, setStreakStartOpen] = useState(false);

  const initialized = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // One-time conversation bootstrap (the shell guarantees an authed workspace).
  useEffect(() => {
    if (!workspace || initialized.current) return;
    initialized.current = true;

    const wsId = workspace.id;
    (async () => {
      setLoadingHistory(true);
      try {
        const convs = await listConversations(wsId);
        const convId = convs[0]?.id ?? (await createConversation(wsId)).id;
        setConversationId(convId);
        const { messages: rows } = await listMessages(wsId, convId);
        // API returns newest-first; reverse for chronological display.
        setMessages(
          [...rows]
            .reverse()
            .map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt })),
        );
      } catch (err) {
        handleError(err);
      } finally {
        setLoadingHistory(false);
      }
    })();
  }, [workspace]);

  // Keep the view pinned to the latest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  function handleError(err: unknown) {
    if (err instanceof ApiError) {
      if (err.status === 429) {
        // The chat daily-limit 429 carries { upgradeRequired: true } — the highest-intent
        // upgrade moment in the app, so we surface an inline upgrade CTA (see notice block).
        const upgrade = !!(err.details as { upgradeRequired?: boolean } | undefined)?.upgradeRequired;
        setNotice({ kind: 'limit', message: err.message, upgrade });
      } else if (err.status === 503) setNotice({ kind: 'down', message: err.message });
      else if (err.status === 401)
        setNotice({ kind: 'error', message: 'Your session expired. Please sign in again.' });
      else setNotice({ kind: 'error', message: err.message });
    } else {
      setNotice({ kind: 'error', message: 'Something went wrong. Please try again.' });
    }
  }

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

    // The typewriter owns the bubble's text: deltas are buffered and revealed
    // smoothly so the reply reads like fluid typing instead of bursting in.
    const typer = createTypewriter((text) => patch((msg) => ({ ...msg, content: text })));
    let produced = false; // whether any content has been fed to the typewriter
    let finalMessage: ChatMessageView | null = null;

    try {
      await streamMessage(workspace.id, conversationId, content, {
        onText: (text) => {
          produced = true;
          typer.push(text);
        },
        onAction: (a) => {
          patch((msg) => ({ ...msg, actions: [...(msg.actions ?? []), a] }));
          if (a.type === 'TRANSACTION_CREATED') {
            track('transaction_logged', { tx_type: a.txType, currency: a.preview.currency });
            if (a.currentStreak != null) {
              setUser({
                currentStreak: a.currentStreak,
                longestStreak: Math.max(user?.longestStreak ?? 0, a.currentStreak),
              });
              if (a.currentStreak === 1) {
                void (async () => {
                  try {
                    const shown = localStorage.getItem(STREAK_START_SHOWN_KEY) === '1';
                    const pushState = await getPushState();
                    if (shouldPromptStreakStart(1, pushState, shown)) setStreakStartOpen(true);
                  } catch {
                    /* storage or push lookup unavailable — skip the prompt */
                  }
                })();
              }
            }
          } else if (a.type === 'BUDGET_SET') {
            track('budget_set', { currency: a.preview.currency });
          }
        },
        onPending: (c) => patch((msg) => ({ ...msg, confirmations: [...(msg.confirmations ?? []), c] })),
        onDone: (message) => {
          finalMessage = message;
          // If the model streamed no text, animate the server's final content
          // (e.g. the fallback summary) so the bubble is never left empty.
          if (!produced && message.content) {
            produced = true;
            typer.push(message.content);
          }
        },
        onError: (e) => {
          // Tools may have already committed and streamed their cards; surface the
          // failure text (if nothing else was produced) and a notice.
          if (!produced && e.message) {
            produced = true;
            typer.push(e.message);
          }
          setNotice({ kind: 'down', message: e.message });
        },
      });

      // Let the buffer finish revealing before we finalize the bubble id.
      await typer.finish();
      const fm = finalMessage as ChatMessageView | null;
      if (fm) patch((msg) => ({ ...msg, id: fm.id, createdAt: fm.createdAt }));
    } catch (err) {
      // Pre-stream failure (429/503/400): nothing rendered yet — drop the
      // placeholder bubble and route through the existing error handler.
      typer.cancel();
      setMessages((m) => m.filter((msg) => msg.id !== assistantId));
      handleError(err);
    } finally {
      setSending(false);
    }
  }

  // A receipt logged from the chat entry point keeps the conversational feel:
  // a pre-composed assistant bubble is persisted (no LLM call) and appended
  // locally. If persistence fails, the bubble still shows for this session.
  async function handleReceiptLogged(tx: Transaction, extraction: ReceiptExtraction) {
    track('transaction_logged', {
      tx_type: 'EXPENSE',
      currency: tx.currencyOriginal,
      source: 'receipt_scan',
    });
    // The log may have advanced the spending streak; the generic transactions
    // endpoint doesn't return it, so refresh the user in the background.
    void refreshUser();
    const content = `Got it — logged ${tx.amountOriginal} ${tx.currencyOriginal} at ${
      tx.merchant ?? extraction.merchant
    } under ${tx.category?.name ?? 'Uncategorized'} from your receipt 🧾`;

    if (workspace && conversationId) {
      try {
        const message = await appendAssistantNote(workspace.id, conversationId, content);
        setMessages((m) => [
          ...m,
          {
            id: message.id,
            role: message.role,
            content: message.content,
            createdAt: message.createdAt,
          },
        ]);
        return;
      } catch {
        /* fall through to the local-only bubble */
      }
    }
    setMessages((m) => [
      ...m,
      { id: genId(), role: 'ASSISTANT', content, createdAt: new Date().toISOString() },
    ]);
  }

  // `/clear` and the "New chat" button both land here. Nothing to clear on an
  // empty thread, so it's a no-op (avoids spawning throwaway conversations).
  function requestClear() {
    if (messages.length === 0 || sending || clearing) return;
    setClearOpen(true);
  }

  // Start a fresh conversation: the old one stays in the DB (recoverable),
  // and the AI context resets because summary/history are per-conversation.
  // No financial data is touched — transactions live independently of chat.
  async function confirmClear() {
    if (!workspace) return;
    setClearing(true);
    try {
      const { id } = await createConversation(workspace.id);
      setConversationId(id);
      setMessages([]);
      setNotice(null);
      setClearOpen(false);
      track('chat_cleared');
    } catch (err) {
      setClearOpen(false);
      handleError(err);
    } finally {
      setClearing(false);
    }
  }

  if (loadingHistory) {
    return (
      <div className="flex h-full items-center justify-center">
        <TypingDots />
      </div>
    );
  }

  const noticeStyles: Record<NonNullable<Notice>['kind'], string> = {
    limit: 'border-warn/40 bg-warn/10 text-warn',
    down: 'border-warn/40 bg-warn/10 text-warn',
    error: 'border-danger/40 bg-danger/10 text-danger',
  };

  return (
    <div className="flex h-full flex-col pb-nav">
      {messages.length > 0 && (
        <div className="flex shrink-0 justify-end px-4 pt-3">
          <button
            type="button"
            onClick={requestClear}
            disabled={sending || clearing}
            className="rounded-full border border-line bg-surface/80 px-3 py-1.5 text-xs text-muted backdrop-blur transition hover:border-accent/50 hover:text-ink disabled:opacity-50"
          >
            + New chat
          </button>
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
          {messages.length === 0 && (
            <div className="mt-16 text-center animate-fade-up">
              <Lottie src="/lottie/empty.json" className="mx-auto mb-2 h-24 w-24" />
              <h1 className="font-display text-2xl font-bold text-ink">
                Hey{user ? `, ${user.displayName}` : ''} 👋
              </h1>
              <p className="mt-2 text-balance text-sm text-muted">
                Tell me what you spent or earned and I’ll log it. Try{' '}
                <span className="text-ink">“spent 12 on lunch”</span>.
              </p>
            </div>
          )}

          {messages.map((m, i) => {
            const showDay = i === 0 || dayKey(m.createdAt) !== dayKey(messages[i - 1]!.createdAt);
            return (
              <Fragment key={m.id}>
                {showDay && (
                  <div className="flex justify-center py-1">
                    <span className="rounded-full border border-line bg-surface/70 px-3 py-1 text-[11px] font-medium text-muted">
                      {dayLabel(m.createdAt)}
                    </span>
                  </div>
                )}
                <MessageBubble
                  role={m.role}
                  content={m.content}
                  createdAt={m.createdAt}
                  lead={
                    m.actions && m.actions.length > 0
                      ? m.actions.map((a, idx) => (
                          <ActionCard
                            key={a.type === 'TRANSACTION_CREATED' ? a.transactionId : `budget-${idx}`}
                            action={a}
                          />
                        ))
                      : undefined
                  }
                >
                  {m.confirmations?.map((c) => (
                    <ConfirmationCard
                      key={c.confirmationId}
                      confirmation={c}
                      disabled={sending}
                      onRespond={handleSend}
                    />
                  ))}
                </MessageBubble>
              </Fragment>
            );
          })}

          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md border border-line bg-surface px-3 py-1.5">
                <Lottie src="/lottie/typing.json" className="h-6 w-14" />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-line bg-canvas/80 backdrop-blur">
        <div className="mx-auto w-full max-w-2xl px-4 py-3">
          {notice && (
            <div className={`mb-2 rounded-xl border px-3.5 py-2.5 text-sm ${noticeStyles[notice.kind]}`}>
              <p>{notice.message}</p>
              {notice.upgrade && (
                <button
                  type="button"
                  onClick={() => setUpgradeOpen(true)}
                  className="mt-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
                >
                  Upgrade to Pro
                </button>
              )}
            </div>
          )}
          <Composer
            disabled={sending}
            onSend={handleSend}
            onClearCommand={requestClear}
            onScanReceipt={() => setScannerOpen(true)}
          />
        </div>
      </div>

      <ReceiptScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onLogged={(tx, extraction) => void handleReceiptLogged(tx, extraction)}
      />

      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} source="chat_limit" />

      <StreakStartPrompt
        open={streakStartOpen}
        onClose={() => setStreakStartOpen(false)}
        streak={1}
      />

      <Modal open={clearOpen} onClose={() => !clearing && setClearOpen(false)} title="Start a fresh chat?">
        <p className="text-sm text-muted">
          This clears the current chat from view and starts a new one. Your previous messages are
          saved, and all your logged transactions stay untouched.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setClearOpen(false)}
            disabled={clearing}
            className="rounded-lg border border-line bg-surface px-3.5 py-2 text-sm text-muted transition hover:text-ink disabled:opacity-50"
          >
            Cancel
          </button>
          <Button type="button" onClick={confirmClear} loading={clearing}>
            Start fresh
          </Button>
        </div>
      </Modal>
    </div>
  );
}
