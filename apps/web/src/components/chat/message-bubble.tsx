import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { timeOfDay } from '@/lib/format';

/** Markdown renderer tuned for the chat bubble + dark theme. Each element gets
 *  explicit classes so tables, lists, code and emphasis render cleanly inside
 *  the small surface bubble (no @tailwindcss/typography dependency). */
function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="space-y-2 break-words text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li className="marker:text-muted">{children}</li>,
          h1: ({ children }) => <h1 className="mt-1 text-base font-semibold text-ink">{children}</h1>,
          h2: ({ children }) => <h2 className="mt-1 text-base font-semibold text-ink">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-1 text-sm font-semibold text-ink">{children}</h3>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer noopener" className="text-accent underline underline-offset-2 hover:text-accent-hover">
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-line pl-3 italic text-muted">{children}</blockquote>
          ),
          hr: () => <hr className="border-line" />,
          code: ({ className, children }) => {
            const isBlock = (className ?? '').includes('language-');
            if (isBlock) {
              return (
                <code className="block overflow-x-auto rounded-lg bg-canvas/60 p-3 font-mono text-[13px] text-ink">
                  {children}
                </code>
              );
            }
            return (
              <code className="rounded bg-canvas/60 px-1.5 py-0.5 font-mono text-[13px] text-ink">{children}</code>
            );
          },
          pre: ({ children }) => <pre className="overflow-x-auto">{children}</pre>,
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-[13px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="border-b border-line">{children}</thead>,
          th: ({ children }) => <th className="px-2 py-1.5 font-semibold text-ink">{children}</th>,
          td: ({ children }) => <td className="border-t border-line px-2 py-1.5 align-top">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/** A single chat bubble. USER is right-aligned + accent; everything else
 *  (ASSISTANT) is left-aligned on a surface. `lead` renders above the text
 *  (committed action cards — the settled result of logging); `children` render
 *  below it (pending confirmation cards tied to the prose). The text bubble is
 *  suppressed until content is non-empty, so no empty box shows mid-stream.
 *  Assistant content is rendered as Markdown; user text stays verbatim. */
export function MessageBubble({
  role,
  content,
  createdAt,
  lead,
  children,
}: {
  role: string;
  content: string;
  createdAt?: string;
  /** Rendered above the text bubble — for committed action cards. */
  lead?: ReactNode;
  children?: ReactNode;
}) {
  const isUser = role === 'USER';
  const hasText = content.trim().length > 0;
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[85%] flex-col sm:max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        {lead}
        {hasText && (
          <div
            className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              isUser
                ? 'whitespace-pre-wrap bg-accent text-white rounded-br-md'
                : `border border-line bg-surface text-ink rounded-bl-md${lead != null ? ' mt-2' : ''}`
            }`}
          >
            {isUser ? content : <MarkdownContent content={content} />}
          </div>
        )}
        {children}
        {createdAt && <p className="mt-1 px-1 text-[11px] text-faint">{timeOfDay(createdAt)}</p>}
      </div>
    </div>
  );
}
