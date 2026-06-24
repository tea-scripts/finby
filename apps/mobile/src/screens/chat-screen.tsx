import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ChatAction, ChatMessageView, PendingConfirmation } from '@finby/shared';
import { ActionCard } from '../components/chat/action-card';
import { Composer } from '../components/chat/composer';
import { ConfirmationCard } from '../components/chat/confirmation-card';
import { MessageBubble } from '../components/chat/message-bubble';
import { TypingIndicator } from '../components/chat/typing-indicator';
import { Wordmark } from '../components/ui/wordmark';
import { StreakBadge } from '../components/dashboard/streak-badge';
import { useTabBarSpace } from '../components/nav/floating-tab-bar';
import { chatNotice, type ChatNotice } from '../lib/chat-notice';
import { createTypewriter } from '../lib/typewriter';
import { useAuthStore } from '../lib/use-auth-store';
import { api } from '../lib/runtime.native';

interface UiMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  actions?: ChatAction[];
  confirmations?: PendingConfirmation[];
}

let idSeq = 0;
function genId(): string {
  idSeq += 1;
  return `local-${Date.now()}-${idSeq}`;
}

const NOTICE_STYLES: Record<ChatNotice['kind'], string> = {
  limit: 'border-warn/40 bg-warn/10',
  down: 'border-warn/40 bg-warn/10',
  error: 'border-danger/40 bg-danger/10',
};

export function ChatScreen() {
  const workspace = useAuthStore((s) => s.workspace);
  const user = useAuthStore((s) => s.user);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<ChatNotice | null>(null);
  const listRef = useRef<FlatList<UiMessage>>(null);
  const tabBarSpace = useTabBarSpace();

  // Bootstrap: reuse the latest conversation or create one, then load history.
  useEffect(() => {
    if (!workspace) return;
    let cancelled = false;
    (async () => {
      setLoadingHistory(true);
      try {
        const convs = await api.chat.listConversations(workspace.id);
        const convId = convs[0]?.id ?? (await api.chat.createConversation(workspace.id)).id;
        const { messages: rows } = await api.chat.listMessages(workspace.id, convId);
        if (cancelled) return;
        setConversationId(convId);
        // API returns newest-first; reverse for chronological display.
        setMessages(
          [...rows].reverse().map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt })),
        );
      } catch (err) {
        if (!cancelled) setNotice(chatNotice(err));
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspace]);

  async function send(content: string) {
    if (!workspace || !conversationId || sending) return;
    setNotice(null);
    const assistantId = genId();
    setMessages((m) => [
      ...m,
      { id: genId(), role: 'USER', content, createdAt: new Date().toISOString() },
      { id: assistantId, role: 'ASSISTANT', content: '', createdAt: new Date().toISOString(), actions: [], confirmations: [] },
    ]);
    setSending(true);

    const patch = (fn: (msg: UiMessage) => UiMessage) =>
      setMessages((m) => m.map((msg) => (msg.id === assistantId ? fn(msg) : msg)));

    // The typewriter owns the bubble's text: streamed deltas are buffered and
    // revealed smoothly so the reply reads like fluid typing.
    const typer = createTypewriter((text) => patch((msg) => ({ ...msg, content: text })));
    let produced = false;
    let finalMessage: ChatMessageView | null = null;

    try {
      await api.chat.streamMessage(workspace.id, conversationId, content, {
        onText: (text) => {
          produced = true;
          typer.push(text);
        },
        onAction: (a) => patch((msg) => ({ ...msg, actions: [...(msg.actions ?? []), a] })),
        onPending: (c) => patch((msg) => ({ ...msg, confirmations: [...(msg.confirmations ?? []), c] })),
        onDone: (message) => {
          finalMessage = message;
          // If the model streamed no text, reveal the server's final content.
          if (!produced && message.content) {
            produced = true;
            typer.push(message.content);
          }
        },
        onError: (e) => {
          if (!produced && e.message) {
            produced = true;
            typer.push(e.message);
          }
          setNotice({ kind: 'down', message: e.message });
        },
      });
      // Let the buffer finish revealing before finalizing the bubble id.
      await typer.finish();
      const fm = finalMessage as ChatMessageView | null;
      if (fm) patch((msg) => ({ ...msg, id: fm.id, createdAt: fm.createdAt }));
    } catch (err) {
      // Pre-stream failure (429/503/400): nothing rendered — drop the placeholder.
      typer.cancel();
      setMessages((m) => m.filter((msg) => msg.id !== assistantId));
      setNotice(chatNotice(err));
    } finally {
      setSending(false);
    }
  }

  async function newChat() {
    if (!workspace || sending) return;
    try {
      const { id } = await api.chat.createConversation(workspace.id);
      setConversationId(id);
      setMessages([]);
      setNotice(null);
    } catch (err) {
      setNotice(chatNotice(err));
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between border-b border-line px-4 py-3">
        <Wordmark height={22} />
        <View className="flex-row items-center gap-3">
          <StreakBadge streak={user?.currentStreak ?? 0} />
          <Pressable onPress={() => void newChat()} accessibilityRole="button" accessibilityLabel="New chat" hitSlop={8}>
            <Text className="text-sm font-medium text-accent">New chat</Text>
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        {loadingHistory ? (
          <View className="flex-1 items-center justify-center">
            <TypingIndicator />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerClassName="gap-3 px-4 py-4"
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <View className="mt-24 items-center px-6">
                <Text className="text-2xl font-semibold text-ink">
                  Hey{user ? `, ${user.displayName}` : ''} 👋
                </Text>
                <Text className="mt-2 text-center text-sm text-muted">
                  Tell me what you spent or earned and I’ll log it. Try “spent 12 on lunch”.
                </Text>
              </View>
            }
            ListFooterComponent={sending ? <TypingIndicator /> : null}
            renderItem={({ item }) => (
              <View className="gap-1.5">
                {item.actions?.map((a, i) => (
                  <ActionCard key={a.type === 'TRANSACTION_CREATED' ? a.transactionId : `budget-${i}`} action={a} />
                ))}
                <MessageBubble role={item.role} content={item.content} />
                {item.confirmations?.map((c) => (
                  <ConfirmationCard key={c.confirmationId} confirmation={c} disabled={sending} onRespond={send} />
                ))}
              </View>
            )}
          />
        )}

        {notice ? (
          <View className={`mx-3 mb-2 rounded-xl border px-3.5 py-2.5 ${NOTICE_STYLES[notice.kind]}`}>
            <Text className={`text-sm ${notice.kind === 'error' ? 'text-danger' : 'text-warn'}`}>
              {notice.message}
            </Text>
          </View>
        ) : null}

        <View style={{ paddingBottom: tabBarSpace }}>
          <Composer disabled={sending} onSend={send} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
