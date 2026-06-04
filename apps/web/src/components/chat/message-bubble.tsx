import type { ReactNode } from 'react';
import { timeOfDay } from '@/lib/format';

/** A single chat bubble. USER is right-aligned + accent; everything else
 *  (ASSISTANT) is left-aligned on a surface. Children render below the text
 *  for attached action / confirmation cards. */
export function MessageBubble({
  role,
  content,
  createdAt,
  children,
}: {
  role: string;
  content: string;
  createdAt?: string;
  children?: ReactNode;
}) {
  const isUser = role === 'USER';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[85%] flex-col sm:max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? 'bg-accent text-white rounded-br-md'
              : 'border border-line bg-surface text-ink rounded-bl-md'
          }`}
        >
          {content}
        </div>
        {children}
        {createdAt && <p className="mt-1 px-1 text-[11px] text-faint">{timeOfDay(createdAt)}</p>}
      </div>
    </div>
  );
}
