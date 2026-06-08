'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { ActionCard } from '@/components/chat/action-card';
import { Composer } from '@/components/chat/composer';
import { ConfirmationCard } from '@/components/chat/confirmation-card';
import { MessageBubble } from '@/components/chat/message-bubble';
import { TypingDots } from '@/components/chat/typing-dots';
import { Lottie } from '@/components/ui/lottie';
import { ApiError } from '@/lib/api-client';
import { dayKey, dayLabel } from '@/lib/format';
import {
  createConversation,
  listConversations,
  listMessages,
  sendMessage,
} from '@/lib/chat-api';
import { useAuth } from '@/lib/store';
import { track } from '@/lib/analytics';
import type { ChatAction, PendingConfirmation } from '@/lib/types';

interface UiMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  actions?: ChatAction[];
  confirmations?: PendingConfirmation[];
}

type Notice = { kind: 'limit' | 'down' | 'error'; message: string } | null;

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

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

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
      if (err.status === 429) setNotice({ kind: 'limit', message: err.message });
      else if (err.status === 503) setNotice({ kind: 'down', message: err.message });
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
    setMessages((m) => [
      ...m,
      { id: genId(), role: 'USER', content, createdAt: new Date().toISOString() },
    ]);
    setSending(true);
    track('chat_message_sent');
    try {
      const result = await sendMessage(workspace.id, conversationId, content);
      setMessages((m) => [
        ...m,
        {
          id: result.message.id,
          role: result.message.role,
          content: result.message.content,
          createdAt: result.message.createdAt,
          actions: result.actions,
          confirmations: result.pendingConfirmations,
        },
      ]);
      for (const a of result.actions) {
        if (a.type === 'TRANSACTION_CREATED') {
          track('transaction_logged', { tx_type: a.txType, currency: a.preview.currency });
        } else if (a.type === 'BUDGET_SET') {
          track('budget_set', { currency: a.preview.currency });
        }
      }
    } catch (err) {
      handleError(err);
    } finally {
      setSending(false);
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
                <MessageBubble role={m.role} content={m.content} createdAt={m.createdAt}>
                  {m.actions?.map((a, idx) => (
                    <ActionCard key={a.type === 'TRANSACTION_CREATED' ? a.transactionId : `budget-${idx}`} action={a} />
                  ))}
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
              {notice.message}
            </div>
          )}
          <Composer disabled={sending} onSend={handleSend} />
        </div>
      </div>
    </div>
  );
}
